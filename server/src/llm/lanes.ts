import { getSettings } from '../config/settings.js';
import { getProject } from '../config/projects.js';
import { openaiChat } from './openai.js';
import { anthropicChat } from './anthropic.js';
import { logger } from '../util/logger.js';
import {
  classifyError,
  errorStatus,
  pickModel,
  poolModelsFor,
  resolveProviders,
  retryAfterMs,
  usableKeys
} from './routing.js';
import type { ChatMessage, ChatRequest, Provider, ProviderKey, TaskType } from '../types.js';

/**
 * A lane is one (provider, api key, model) triple — the smallest unit that can
 * carry a request independently. Rate limits are enforced per key and per model,
 * so two lanes never contend as long as they differ in either dimension. Running
 * one work item per lane is what turns a serial batch of questions into a single
 * parallel round trip.
 */
export interface Lane {
  id: string;
  provider: Provider;
  key: ProviderKey;
  model: string;
  /** A lane serves one request at a time; a second would just self-throttle. */
  busy: boolean;
  /** Epoch ms before which this lane must not be used again. */
  cooldownUntil: number;
  consecutiveFailures: number;
  disabled: boolean;
  disabledReason?: string;
  completed: number;
  lastUsed: number;
  /** Higher is more capable; breaks ties so long units avoid the weakest models. */
  rank: number;
}

export interface LaneScope {
  projectId?: string;
  providerId?: string;
  model?: string;
  taskType?: TaskType;
}

export interface PoolOptions {
  /** Upper bound on simultaneous upstream requests. Defaults to the lane count. */
  maxConcurrency?: number;
  /** How many lanes a single work item may be retried across. */
  attempts?: number;
  /** Label used in logs. */
  label?: string;
}

// ---------------------------------------------------------------------------
// Shared in-flight registry
// ---------------------------------------------------------------------------

// Lane pools claim keys while they work. The single-shot chat path reads this so
// an interactive message is not queued behind a bulk notes generation on the
// same key — chat prefers whichever key is currently idle.
const inflightByKey = new Map<string, number>();

function keyRef(providerId: string, keyId: string): string {
  return `${providerId}::${keyId}`;
}

export function keyLoad(providerId: string, keyId: string): number {
  return inflightByKey.get(keyRef(providerId, keyId)) || 0;
}

function claimKey(lane: Lane): void {
  const ref = keyRef(lane.provider.id, lane.key.id);
  inflightByKey.set(ref, (inflightByKey.get(ref) || 0) + 1);
}

function releaseKey(lane: Lane): void {
  const ref = keyRef(lane.provider.id, lane.key.id);
  const n = (inflightByKey.get(ref) || 1) - 1;
  if (n <= 0) inflightByKey.delete(ref);
  else inflightByKey.set(ref, n);
}

// ---------------------------------------------------------------------------
// Lane construction
// ---------------------------------------------------------------------------

/**
 * How capable a model is for long-form writing. A 9B free model cannot produce a
 * 480-word exam answer no matter how the prompt is worded, so when several lanes
 * are free the strongest one takes the work. Ranking is only a tiebreak — a weak
 * lane is still far better than waiting on a rate limit.
 */
function rankModel(provider: Provider, modelId: string): number {
  const info = provider.models?.find((m) => m.id === modelId);
  let rank = info?.maxTokens || 4096;
  if (info?.metadata?.quality === 'high') rank *= 2;
  else if (info?.metadata?.quality === 'low') rank /= 2;
  // Parameter count in the id is the most reliable signal these ids carry.
  const b = modelId.match(/(\d+(?:\.\d+)?)\s*b\b/i);
  if (b) rank += Number(b[1]) * 100;
  if (/\bnano\b|\bmini\b|\bxs\b|\bsmall\b|instant|flash|guard/i.test(modelId)) rank *= 0.6;
  return Math.round(rank);
}

/**
 * Build every usable (provider, key, model) lane for this request, ordered so
 * that consecutive lanes differ in key first and model second. Work handed out
 * in order therefore spreads across distinct keys before reusing one.
 */
export function buildLanes(scope: LaneScope): Lane[] {
  const settings = getSettings();
  const project = getProject(scope.projectId);
  const task = scope.taskType ? settings.taskConfigs[scope.taskType] : undefined;

  // Grouped per provider so we can interleave keys across the whole fleet.
  const groups: Lane[][] = [];

  for (const provider of resolveProviders(scope)) {
    if (!provider.enabled) continue;
    const primary = pickModel(provider, scope, project);
    if (!primary) continue;

    // A pinned per-task model must be honoured exactly; otherwise dynamic
    // routing may widen the lane set with the configured model pool.
    const models = task && !task.useDefault ? [primary] : poolModelsFor(provider, settings, primary);
    const keys = usableKeys(provider);
    if (!keys.length || !models.length) continue;

    const lanes: Lane[] = [];
    // Model-major within a key would put all of one key's lanes together; we
    // want key-major so the first N items land on N different keys.
    for (let mi = 0; mi < models.length; mi++) {
      for (let ki = 0; ki < keys.length; ki++) {
        lanes.push({
          id: `${provider.id}::${keys[ki].id}::${models[mi]}`,
          provider,
          key: keys[ki],
          model: models[mi],
          busy: false,
          cooldownUntil: 0,
          consecutiveFailures: 0,
          disabled: false,
          completed: 0,
          lastUsed: 0,
          rank: rankModel(provider, models[mi])
        });
      }
    }
    groups.push(lanes);
  }

  // Round-robin across providers so the highest-priority provider is not
  // exhausted before a second one is touched. We alternate by provider id
  // rather than index so no lane is silently dropped when groups have
  // different lengths.
  const out: Lane[] = [];
  const total = groups.reduce((n, g) => n + g.length, 0);
  const cursors = groups.map(() => 0);
  let gi = 0;
  for (let placed = 0; placed < total; placed++) {
    // advance to the next group that still has lanes to emit
    let tries = 0;
    while (tries < groups.length && cursors[gi] >= groups[gi].length) {
      gi = (gi + 1) % groups.length;
      tries++;
    }
    if (tries >= groups.length) break;
    out.push(groups[gi][cursors[gi]]);
    cursors[gi]++;
    gi = (gi + 1) % groups.length;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Pool
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

export class LanePool {
  readonly lanes: Lane[];
  private readonly maxConcurrency: number;
  private readonly attempts: number;
  private readonly label: string;
  private running = 0;
  private waiters = new Set<() => void>();

  constructor(lanes: Lane[], opts: PoolOptions = {}) {
    this.lanes = lanes;
    this.maxConcurrency = Math.max(1, Math.min(opts.maxConcurrency ?? lanes.length, lanes.length || 1));
    this.attempts = Math.max(2, opts.attempts ?? Math.min(8, Math.max(3, lanes.length)));
    this.label = opts.label || 'pool';
  }

  get size(): number {
    return this.lanes.length;
  }

  /** Lanes that are neither disabled nor currently cooling. */
  get healthy(): number {
    const now = Date.now();
    return this.lanes.filter((l) => !l.disabled && l.cooldownUntil <= now).length;
  }

  private notify(): void {
    for (const w of this.waiters) {
      w();
      return;
    }
  }

  /** Resolves once a lane is idle, off cooldown, and under the concurrency cap. */
  private async acquire(signal?: AbortSignal): Promise<Lane> {
    for (;;) {
      if (signal?.aborted) throw new Error('aborted');
      const now = Date.now();
      const alive = this.lanes.filter((l) => !l.disabled);
      if (!alive.length) {
        throw new Error(
          `All lanes are unusable (${this.lanes.length} tried). Check API keys and model configuration in Settings → Providers.`
        );
      }

      if (this.running < this.maxConcurrency) {
        const free = alive.filter((l) => !l.busy && l.cooldownUntil <= now);
        if (free.length) {
          // Prefer the strongest lane that has not just been used: capability
          // decides output quality, least-recently-used keeps keys rotating.
          free.sort(
            (a, b) => a.lastUsed - b.lastUsed || b.rank - a.rank || a.completed - b.completed
          );
          const lane = free[0];
          lane.busy = true;
          lane.lastUsed = now;
          this.running++;
          claimKey(lane);
          return lane;
        }
      }

      // Nothing free right now. Either another request will finish (a release
      // notifies us) or a cooldown will expire — whichever comes first.
      const cooling = alive.filter((l) => !l.busy && l.cooldownUntil > now).map((l) => l.cooldownUntil);
      const nextExpiry = cooling.length ? Math.min(...cooling) - now : undefined;
      const anyBusy = alive.some((l) => l.busy);

      if (!anyBusy && nextExpiry === undefined) {
        throw new Error('No lane available and none scheduled to recover');
      }

      await new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          // Drop the stale entry, otherwise a later notify() would hand the
          // wake-up to an already-resolved waiter and strand a live one.
          this.waiters.delete(finish);
          resolve();
        };
        const timer = setTimeout(finish, nextExpiry !== undefined ? Math.min(nextExpiry + 25, 2000) : 250);
        this.waiters.add(finish);
      });
    }
  }

  private release(lane: Lane): void {
    lane.busy = false;
    this.running--;
    releaseKey(lane);
    this.notify();
  }

  private coolLane(lane: Lane, err: any, base: number): void {
    const wait = retryAfterMs(err, base);
    lane.cooldownUntil = Date.now() + wait;
    logger.warn(
      `[${this.label}] ${lane.provider.name}/${lane.key.label}/${lane.model} rate limited → cooling ${Math.round(
        wait
      )}ms`
    );
  }

  private disableKeyLanes(lane: Lane, reason: string): void {
    for (const l of this.lanes) {
      if (l.provider.id === lane.provider.id && l.key.id === lane.key.id) {
        l.disabled = true;
        l.disabledReason = reason;
      }
    }
    logger.warn(`[${this.label}] key ${lane.provider.name}/${lane.key.label} disabled: ${reason}`);
  }

  /**
   * Run one completion, transparently moving to another lane on rate limits and
   * provider errors. Returns the text plus the lane that produced it.
   */
  async exec(
    req: Omit<ChatRequest, 'messages'> & { messages: ChatMessage[] },
    opts: { signal?: AbortSignal } = {}
  ): Promise<{ content: string; lane: Lane; truncated: boolean }> {
    const settings = getSettings();
    let backoff = settings.backoffMs || 2000;
    let lastErr: any;

    for (let attempt = 0; attempt < this.attempts; attempt++) {
      const lane = await this.acquire(opts.signal);
      // `truncated` is set by the adapter, so each attempt needs its own copy.
      const attemptReq: ChatRequest = { ...req, truncated: false };
      try {
        const content =
          lane.provider.format === 'openai'
            ? await openaiChat(lane.provider, lane.key, lane.model, attemptReq)
            : await anthropicChat(lane.provider, lane.key, lane.model, attemptReq);
        lane.consecutiveFailures = 0;
        lane.completed++;
        this.release(lane);
        return { content, lane, truncated: !!attemptReq.truncated };
      } catch (err: any) {
        lastErr = err;
        const kind = classifyError(err);
        this.release(lane);

        switch (kind) {
          case 'rate-limit':
          case 'too-large':
            this.coolLane(lane, err, backoff);
            backoff = Math.min(Math.floor(backoff * (settings.backoffFactor || 1.5)), 15_000);
            break;
          case 'auth':
            this.disableKeyLanes(lane, `auth error ${errorStatus(err)}`);
            break;
          case 'bad-model':
            lane.disabled = true;
            lane.disabledReason = 'model rejected by provider';
            logger.warn(`[${this.label}] ${lane.provider.name} rejected model "${lane.model}": ${err?.message}`);
            break;
          case 'server':
            lane.consecutiveFailures++;
            lane.cooldownUntil = Date.now() + Math.min(backoff, 10_000);
            if (lane.consecutiveFailures >= 3) {
              lane.disabled = true;
              lane.disabledReason = 'repeated upstream errors';
            }
            break;
          default:
            // A malformed request fails identically everywhere — do not burn
            // the remaining lanes discovering that.
            throw err;
        }
      }
    }

    throw lastErr || new Error('All lanes exhausted');
  }
}

/** Snapshot the current provider/key/model fleet into a pool for one operation. */
export function createPool(scope: LaneScope, opts: PoolOptions = {}): LanePool {
  const lanes = buildLanes(scope);
  if (!lanes.length) {
    throw new Error('No LLM provider configured. Add one in Settings → Providers.');
  }
  logger.info(
    `[${opts.label || 'pool'}] ${lanes.length} lane(s) available: ` +
      [...new Set(lanes.map((l) => `${l.provider.name}(${l.key.label})`))].join(', ')
  );
  return new LanePool(lanes, opts);
}

export interface MapOutcome<R> {
  ok: boolean;
  value?: R;
  error?: any;
  index: number;
}

/**
 * Run `worker` over every item concurrently, up to `pool.maxConcurrency` at a
 * time. Individual failures are captured rather than thrown so a single bad
 * item cannot lose the rest of the pack.
 */
export async function mapPool<T, R>(
  pool: LanePool,
  items: T[],
  worker: (item: T, pool: LanePool, index: number) => Promise<R>
): Promise<MapOutcome<R>[]> {
  const outcomes: MapOutcome<R>[] = new Array(items.length);
  const limit = Math.min(pool.maxConcurrency, items.length);

  for (let i = 0; i < items.length; i += limit) {
    const slice = items.slice(i, i + limit);
    const sliceIndexes = Array.from({ length: slice.length }, (_, k) => i + k);
    const sliceOutcomes = await Promise.all(
      slice.map(async (item, k): Promise<MapOutcome<R>> => {
        const index = sliceIndexes[k];
        try {
          return { ok: true, value: await worker(item, pool, index), index };
        } catch (error) {
          return { ok: false, error, index };
        }
      })
    );
    sliceOutcomes.forEach((o, k) => { outcomes[i + k] = o; });
  }
  return outcomes;
}

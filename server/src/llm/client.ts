import { getSettings } from '../config/settings.js';
import { saveCooldown } from '../config/providers.js';
import { getProject } from '../config/projects.js';
import { openaiChat } from './openai.js';
import { anthropicChat } from './anthropic.js';
import { keyLoad } from './lanes.js';
import { logger } from '../util/logger.js';
import {
  classifyError,
  pickModel,
  poolModelsFor,
  resolveProviders,
  retryAfterMs,
  usableKeys
} from './routing.js';
import type { ChatRequest, ChatResult, Provider, ProviderKey } from '../types.js';

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Round-robin cursors per provider id (in-memory; resets with the process).
const rrCursor = new Map<string, number>();

/**
 * Keys of a provider in the order they should be tried. Keys already carrying
 * parallel work (a notes generation, say) sort last, so an interactive chat
 * turn is not queued behind a bulk job on the same key. Ties rotate.
 */
function rotatedKeys(provider: Provider): ProviderKey[] {
  const keys = usableKeys(provider);
  if (!keys.length) return [];
  const start = rrCursor.get(provider.id) ?? 0;
  rrCursor.set(provider.id, start + 1);
  const rotated = keys.map((_, i) => keys[(start + i) % keys.length]);
  return rotated.sort((a, b) => keyLoad(provider.id, a.id) - keyLoad(provider.id, b.id));
}

async function doChat(
  provider: Provider,
  key: ProviderKey,
  model: string,
  req: ChatRequest,
  onToken?: (delta: string) => void
): Promise<string> {
  if (provider.format === 'openai') {
    return openaiChat(provider, key, model, req, onToken);
  }
  return anthropicChat(provider, key, model, req, onToken);
}

interface TryResult {
  ok: boolean;
  res?: ChatResult;
  err?: any;
  fatal?: boolean; // non-trigger error — stop all failback
}

// Try all enabled (non-cooldown) keys and models of a single provider, failing over.
// Loop order: provider → key (round-robin) → model. On rate limit, try next model
// on the same key before cooling the key. Returns which model actually worked.
async function tryProvider(
  provider: Provider,
  models: string[],
  req: ChatRequest,
  onToken: ((delta: string) => void) | undefined,
  settings = getSettings()
): Promise<TryResult> {
  if (!models.length) {
    return { ok: false, err: new Error(`Provider "${provider.name}" has no models to try`) };
  }

  const keys = rotatedKeys(provider);
  if (!keys.length) {
    return { ok: false, err: new Error('No available API keys (all in cooldown)') };
  }

  const triedKeys = new Set<string>();
  let backoff = settings.backoffMs;
  let lastErr: any;

  const maxKeyAttempts = Math.max(keys.length, settings.maxRetries);
  for (let ki = 0; ki < maxKeyAttempts; ki++) {
    // Re-check cooldowns on each pick (cooldowns may have been applied mid-loop)
    const availKey = keys.find(
      (k) => !triedKeys.has(k.id) && (!k.cooldownUntil || k.cooldownUntil <= Date.now())
    );
    if (!availKey) break;
    triedKeys.add(availKey.id);

    for (const model of models) {
      try {
        req.truncated = false;
        const content = await doChat(provider, availKey, model, req, onToken);
        return {
          ok: true,
          res: { content, providerId: provider.id, model, keyId: availKey.id, truncated: req.truncated }
        };
      } catch (err: any) {
        lastErr = err;
        const kind = classifyError(err);

        // Rate limit / auth / server error → try the next model on this key.
        if (kind === 'rate-limit' || kind === 'too-large' || kind === 'server' || kind === 'auth') {
          logger.warn(
            `Provider "${provider.name}" key "${availKey.label}" + model "${model}" ${kind} → trying next model`
          );
          continue;
        }

        // Model mismatch → skip this model, try the next one on this key
        if (kind === 'bad-model') {
          logger.warn(
            `Provider "${provider.name}" key "${availKey.label}" rejected model "${model}": ${err?.message}`
          );
          continue;
        }

        // Non-trigger, non-model error → fatal, abort this provider
        logger.warn(`Provider "${provider.name}" key "${availKey.label}" fatal error: ${err?.message}`);
        return { ok: false, err, fatal: true };
      }
    }

    // All models on this key failed with a retryable error; cool the key and
    // move on. The provider's own retry-after wins over our fixed backoff.
    const kind = classifyError(lastErr);
    if (kind === 'rate-limit' || kind === 'too-large' || kind === 'server' || kind === 'auth') {
      const wait = Math.min(retryAfterMs(lastErr, backoff), 15_000);
      saveCooldown(provider.id, availKey.id, Date.now() + wait);
      logger.warn(
        `Provider "${provider.name}" key "${availKey.label}" exhausted all models (${kind}) → cooldown ${Math.round(
          wait
        )}ms`
      );
      backoff = Math.min(Math.floor(backoff * settings.backoffFactor), 15_000);
      await sleep(Math.min(wait / 2, 1500));
    }
  }

  return { ok: false, err: lastErr || new Error('All keys and models exhausted') };
}

// Public: unified chat with full failback (key → key, then provider → provider).
export async function chat(
  req: ChatRequest,
  onToken?: (delta: string) => void
): Promise<ChatResult> {
  const settings = getSettings();
  const providers = resolveProviders(req);
  if (!providers.length) {
    throw new Error('No LLM provider configured. Add one in Settings → Providers.');
  }
  const project = getProject(req.projectId);

  let lastErr: any;
  for (const provider of providers) {
    if (!provider.enabled) continue;
    const primaryModel = pickModel(provider, req, project);
    if (!primaryModel) {
      lastErr = new Error(`Provider "${provider.name}" has no model selected`);
      continue;
    }

    const task = req.taskType ? settings.taskConfigs[req.taskType] : undefined;
    // A pinned per-task model is honoured exactly; otherwise dynamic routing
    // widens the attempt list with the configured model pool.
    const models = task && !task.useDefault ? [primaryModel] : poolModelsFor(provider, settings, primaryModel);

    // `useDefault` selects the *model*; the task's temperature and token limits
    // still apply either way. Skipping them here is what left content-heavy
    // tasks running against the generic 4000-token default.
    const taskReq = task ? {
      ...req,
      temperature: req.temperature ?? task.temperature,
      maxTokens: req.maxTokens ?? task.maxTokens
    } : req;

    const r = await tryProvider(provider, models, taskReq, onToken, settings);
    if (r.ok && r.res) return r.res;
    if (r.fatal) throw r.err; // stop everything
    lastErr = r.err;
    // provider exhausted; continue to next provider if allowed
    if (settings.failbackMode === 'key-only') {
      throw r.err || new Error('Provider failed and key-only failback is set');
    }
  }
  throw lastErr || new Error('All providers failed');
}

// Convenience: non-streaming chat returning text only.
export async function chatText(req: ChatRequest): Promise<string> {
  const r = await chat(req);
  return r.content;
}

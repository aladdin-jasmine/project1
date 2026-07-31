import { getSettings } from '../config/settings.js';
import { getProviderRaw, getEnabledProviders } from '../config/providers.js';
import { getProject } from '../config/projects.js';
import type { AdvancedSettings, ChatRequest, Provider, ProviderKey } from '../types.js';

// Provider/model/key resolution shared by the single-shot chat path (client.ts)
// and the parallel lane pool (lanes.ts). Both must agree on which provider owns
// which model, otherwise a lane can be built that the chat path would reject.

// A model id is only meaningful to the provider that owns it. Sending a Groq
// model to OpenRouter yields a fatal 400 and aborts the whole failover chain,
// so every candidate is validated against its provider before being used.
export function knowsModel(provider: Provider, modelId: string): boolean {
  if (!provider.models?.length) return true; // model list not loaded — trust the caller
  return provider.models.some((m) => m.id === modelId);
}

/**
 * Ordered models to try on this provider. With dynamic routing on, the primary
 * comes first and the configured pool follows; otherwise just the primary.
 */
export function poolModelsFor(
  provider: Provider,
  settings: AdvancedSettings,
  primaryModel: string | undefined
): string[] {
  if (!settings.dynamicModelSwitch || !settings.dynamicModelPool?.length || !primaryModel) {
    return primaryModel ? [primaryModel] : [];
  }

  const poolEntries = settings.dynamicModelPool
    .filter((entry: string) => entry.includes('::'))
    .map((entry: string) => entry.split('::'))
    .filter(([providerId]: string[]) => providerId === provider.id);

  if (!poolEntries.length) return [primaryModel];

  // Include primary in the pool so it's eligible for rotation too.
  const candidates = new Set<string>([primaryModel]);
  for (const [, modelId] of poolEntries) {
    if (provider.models?.some((m) => m.id === modelId && m.enabled)) {
      candidates.add(modelId);
    }
  }

  // Shuffle so the primary isn't always tried first when lanes are acquired
  // in parallel. This spreads work across the whole pool and prevents a
  // single model from becoming a bottleneck.
  return shuffle([...candidates]);
}

// Simple seeded-ish shuffle: enough to break first-in-first-bottleneck
// without importing crypto/polyfills.
function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = (i * 7 + 13) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function pickModel(
  provider: Provider,
  req: Pick<ChatRequest, 'model' | 'providerId' | 'taskType'>,
  project?: { providerId?: string; defaultModel?: string }
): string | undefined {
  const task = req.taskType ? getSettings().taskConfigs[req.taskType] : undefined;

  // An explicit per-request model is honoured only on its intended provider.
  if (req.model && (!req.providerId || req.providerId === provider.id) && knowsModel(provider, req.model)) {
    return req.model;
  }
  // A task override applies only to the provider it was configured against.
  if (task && !task.useDefault && task.modelId) {
    const belongs = task.providerId ? task.providerId === provider.id : knowsModel(provider, task.modelId);
    if (belongs) return task.modelId;
  }
  // Likewise the project default belongs to the project's provider.
  if (project?.defaultModel) {
    const belongs = project.providerId ? project.providerId === provider.id : knowsModel(provider, project.defaultModel);
    if (belongs) return project.defaultModel;
  }
  if (provider.defaultModel && knowsModel(provider, provider.defaultModel)) return provider.defaultModel;
  return provider.defaultModel || provider.models?.find((m) => m.enabled)?.id;
}

/** Ordered providers to try: primary first, then failback. */
export function resolveProviders(req: Pick<ChatRequest, 'providerId' | 'taskType' | 'projectId'>): Provider[] {
  const task = req.taskType ? getSettings().taskConfigs[req.taskType] : undefined;
  if (req.providerId) {
    const p = getProviderRaw(req.providerId);
    return p ? [p] : [];
  }
  // A task-specific provider is authoritative when configured. If it has been
  // removed/disabled, honour the user's fallback preference instead of silently
  // sending the request to an unrelated provider.
  if (task && !task.useDefault && task.providerId) {
    const p = getProviderRaw(task.providerId);
    if (p?.enabled) return [p];
    if (!task.fallbackToDefault) return [];
  }
  const project = getProject(req.projectId);
  const ordered: Provider[] = [];
  if (project?.providerId) {
    const p = getProviderRaw(project.providerId);
    if (p) ordered.push(p);
  }
  for (const p of getEnabledProviders()) {
    if (!ordered.find((x) => x.id === p.id)) ordered.push(p);
  }
  return ordered;
}

/** Keys that are enabled and not serving a persisted cooldown. */
export function usableKeys(provider: Provider): ProviderKey[] {
  const now = Date.now();
  return provider.keys.filter((k) => k.enabled && (!k.cooldownUntil || k.cooldownUntil <= now));
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

export type ErrorKind =
  | 'rate-limit'   // back off and retry elsewhere; the key/model pair is fine
  | 'too-large'    // request exceeded a per-request/throughput cap
  | 'auth'         // the key itself is bad — stop using it
  | 'bad-model'    // this provider does not serve this model
  | 'server'       // upstream 5xx — transient
  | 'fatal';       // anything else: a bug in the request

export function errorStatus(err: any): number | undefined {
  return err?.status || err?.statusCode || err?.response?.status;
}

// A provider that cannot serve a model says so in many dialects: OpenRouter
// answers "No endpoints found for <id>", others "model not found" or
// "unsupported model". All mean the same thing — retry elsewhere, not fatal.
const BAD_MODEL_RE =
  /model|not a valid|does not exist|unknown model|no endpoints|no allowed providers|unsupported|deprecated|decommissioned|not found/i;

export function classifyError(err: any): ErrorKind {
  const status = errorStatus(err);
  const msg = String(err?.message || '');

  if (status === 429) return 'rate-limit';
  // Some providers use 400/422 instead of 413 for oversized payloads.
  if (status === 413 || status === 422 || status === 400) {
    if (/too large|payload|max tokens|context length|token limit|exceed/i.test(msg)) return 'too-large';
  }
  if (status === 401 || status === 403) return 'auth';
  if ((status === 400 || status === 404) && BAD_MODEL_RE.test(msg)) return 'bad-model';
  if (status && status >= 500) return 'server';
  // Some gateways report throttling as a plain 400/402 with a descriptive body.
  if (/rate.?limit|too many requests|quota|capacity/i.test(msg)) return 'rate-limit';
  if (/timeout|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|fetch failed/i.test(msg)) return 'server';
  if (BAD_MODEL_RE.test(msg)) return 'bad-model';
  return 'fatal';
}

/**
 * How long to wait before this key/model is worth trying again. Providers signal
 * this either in a `retry-after` header or inline in the message ("try again in
 * 7.2s"); honouring it is what stops a retry storm from extending the outage.
 *
 * Cap reduced from 90s to 30s: Groq/OpenRouter rate-limit windows are short
 * enough that a 90s cooldown unnecessarily serialises requests that would
 * succeed seconds later.
 */
export function retryAfterMs(err: any, fallback: number): number {
  const headers = err?.headers || err?.response?.headers;

  // Helper: read a header value regardless of shape
  const getHeader = (name: string): string | undefined => {
    const raw =
      (typeof headers?.get === 'function' ? headers.get(name) : undefined) ??
      headers?.[name];
    return raw != null ? String(raw) : undefined;
  };

  // 1) retry-after header: per HTTP/1.1 this is seconds. Always treat it as
  //    seconds and clamp to the 30s ceiling. (The previous "small values are ms"
  //    heuristic caused 2s→2ms cooldowns and retry storms on Groq/OpenRouter.)
  const retryHeader = getHeader('retry-after');
  if (retryHeader != null) {
    const num = Number(retryHeader);
    if (Number.isFinite(num) && num > 0) {
      return Math.min(num * 1000, 30_000);
    }
  }

  // 2) x-ratelimit-reset-tokens / remaining tokens hints.
  const resetTokens = getHeader('x-ratelimit-reset-tokens');
  if (resetTokens != null) {
    const tokens = Number(resetTokens);
    if (Number.isFinite(tokens) && tokens > 0) {
      return Math.min(tokens * 100, 5_000);
    }
  }

  // 3) Inline message: "try again in 7.2s" / "retry in 3200ms"
  const m = String(err?.message || '').match(/try again in ([\d.]+)\s*(ms|s|m)?/i);
  if (m) {
    const n = Number(m[1]);
    const unit = (m[2] || 's').toLowerCase();
    const ms = unit === 'ms' ? n : unit === 'm' ? n * 60_000 : n * 1000;
    if (Number.isFinite(ms) && ms > 0) return Math.min(ms, 30_000);
  }

  return Math.min(fallback, 30_000);
}

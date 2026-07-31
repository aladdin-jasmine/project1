import { randomUUID } from 'crypto';
import { readJson, writeJson } from '../db/store.js';
import { maskKey } from '../util/mask.js';
import { logger } from '../util/logger.js';
import { deriveLimits } from '../llm/models.js';
import { GROQ_MODELS, OPENAI_MODELS } from '../llm/capabilities.js';
import type { Provider, ProviderFormat, ProviderKey, ModelInfo } from '../types.js';

const FILE = 'providers';

function load(): Provider[] {
  const providers = readJson<Provider[]>(FILE, []);
  // Migrate old providers with string[] models to ModelInfo[]
  return providers.map(p => ({
    ...p,
    models: Array.isArray(p.models) && p.models.length > 0 && typeof p.models[0] === 'string'
      ? (p.models as any[]).map((id: string) => ({
          id,
          name: id,
          capabilities: ['text'],
          contextWindow: 8192,
          maxTokens: 4096,
          enabled: true
        } as ModelInfo))
      : (p.models as ModelInfo[] || []),
    loadBalancing: p.loadBalancing || {
      enabled: false,
      strategy: 'round-robin' as const,
      keyRotation: true
    }
  }));
}

// Boot-time repair: fix placeholder model limits from known tables
export function repairModelLimits(): void {
  const providers = load();
  let repaired = 0;

  for (const provider of providers) {
    if (!provider.models || provider.models.length === 0) continue;

    const isGroq = /groq/i.test(provider.baseUrl);
    const isOpenAI = /openai/i.test(provider.baseUrl);

    for (const model of provider.models) {
      // Check if this model is stuck at the placeholder defaults (8192/4096)
      if (model.contextWindow === 8192 && model.maxTokens === 4096) {
        let known: ModelInfo | undefined;

        if (isGroq && GROQ_MODELS[model.id]) {
          known = GROQ_MODELS[model.id];
        } else if (isOpenAI && OPENAI_MODELS[model.id]) {
          known = OPENAI_MODELS[model.id];
        }

        if (known) {
          model.contextWindow = known.contextWindow;
          model.maxTokens = known.maxTokens;
          repaired++;
        }
      }
    }
  }

  if (repaired > 0) {
    save(providers);
    logger.info(`[Boot] Repaired ${repaired} model(s) with correct limits from known tables`);
  }
}
function save(list: Provider[]): void {
  writeJson(FILE, list);
}

// Mask secret keys before sending to client
export function maskProvider(p: Provider): Provider {
  return {
    ...p,
    keys: p.keys.map((k) => ({
      ...k,
      key: maskKey(k.key),
      hasKey: !!k.key
    })) as any
  };
}

export function listProviders(): Provider[] {
  return load().map(maskProvider).sort((a, b) => a.priority - b.priority);
}

export function getProvider(id: string): Provider | undefined {
  const p = load().find((x) => x.id === id);
  return p ? maskProvider(p) : undefined;
}

// Internal: returns provider WITH real keys (never expose to client directly)
export function getProviderRaw(id: string): Provider | undefined {
  return load().find((x) => x.id === id);
}

export function getEnabledProviders(): Provider[] {
  return load()
    .filter((p) => p.enabled)
    .sort((a, b) => a.priority - b.priority);
}

export interface CreateProviderInput {
  name: string;
  format: ProviderFormat;
  baseUrl: string;
  keys: { label?: string; key: string }[];
  enabled?: boolean;
  defaultModel?: string;
  priority?: number;
}

export function createProvider(input: CreateProviderInput): Provider {
  const list = load();
  const keys: ProviderKey[] = input.keys
    .filter((k) => k.key && k.key.trim())
    .map((k, i) => ({
      id: randomUUID(),
      label: k.label?.trim() || (i === 0 ? 'primary' : `failback-${i}`),
      key: k.key.trim(),
      enabled: true,
      requestCount: 0,
      lastUsed: 0
    }));
  if (keys.length === 0) throw new Error('At least one API key is required');
  const provider: Provider = {
    id: randomUUID(),
    name: input.name.trim(),
    format: input.format,
    baseUrl: input.baseUrl.trim().replace(/\/+$/, ''),
    keys,
    enabled: input.enabled ?? true,
    models: [],
    defaultModel: input.defaultModel,
    priority: input.priority ?? list.length,
    createdAt: new Date().toISOString(),
    loadBalancing: {
      enabled: false,
      strategy: 'round-robin',
      keyRotation: true
    }
  };
  list.push(provider);
  save(list);
  return maskProvider(provider);
}

export function updateProvider(
  id: string,
  patch: Partial<{
    name: string;
    format: ProviderFormat;
    baseUrl: string;
    enabled: boolean;
    defaultModel: string;
    priority: number;
    keys: { id?: string; label?: string; key: string; enabled?: boolean }[];
  }>
): Provider {
  const list = load();
  const idx = list.findIndex((x) => x.id === id);
  if (idx === -1) throw new Error('Provider not found');
  const p = list[idx];
  if (patch.name !== undefined) p.name = patch.name.trim();
  if (patch.format !== undefined) p.format = patch.format;
  if (patch.baseUrl !== undefined) p.baseUrl = patch.baseUrl.trim().replace(/\/+$/, '');
  if (patch.enabled !== undefined) p.enabled = patch.enabled;
  if (patch.defaultModel !== undefined) p.defaultModel = patch.defaultModel;
  if (patch.priority !== undefined) p.priority = patch.priority;
  if (patch.keys !== undefined) {
    p.keys = patch.keys
      .filter((k) => k.key && k.key.trim())
      .map((k, i) => ({
        id: k.id || randomUUID(),
        label: k.label?.trim() || (i === 0 ? 'primary' : `failback-${i}`),
        key: k.key.trim(),
        enabled: k.enabled ?? true
      }));
  }
  list[idx] = p;
  save(list);
  return maskProvider(p);
}

export function deleteProvider(id: string): void {
  const list = load().filter((x) => x.id !== id);
  save(list);
}

export function setModels(id: string, models: ModelInfo[]): Provider {
  const list = load();
  const p = list.find((x) => x.id === id);
  if (!p) throw new Error('Provider not found');
  p.models = models;
  if (!p.defaultModel && models.length) p.defaultModel = models[0].id;
  save(list);
  return maskProvider(p);
}

export function toggleModelEnabled(providerId: string, modelId: string, enabled: boolean): Provider {
  const list = load();
  const p = list.find((x) => x.id === providerId);
  if (!p) throw new Error('Provider not found');
  const model = p.models.find((m) => m.id === modelId);
  if (!model) throw new Error('Model not found');
  model.enabled = enabled;
  save(list);
  return maskProvider(p);
}

export function addModelManually(providerId: string, modelId: string): Provider {
  const list = load();
  const p = list.find((x) => x.id === providerId);
  if (!p) throw new Error('Provider not found');
  
  // Check if model already exists
  const existing = p.models.find((m) => m.id === modelId);
  if (existing) {
    throw new Error('Model already exists');
  }
  
  // Add new model with default capabilities based on provider format
  const newModel: ModelInfo = {
    id: modelId,
    name: modelId,
    capabilities: p.format === 'anthropic' 
      ? ['text', 'vision', 'reasoning'] 
      : ['text'],
    contextWindow: 8192,
    maxTokens: 4096,
    enabled: true,
    metadata: {
      speed: 'medium' as const,
      quality: 'medium' as const,
      vendor: 'Custom',
      description: 'Manually added model'
    }
  };
  
  p.models.push(newModel);
  
  // If this is the first model, set it as default
  if (!p.defaultModel) {
    p.defaultModel = modelId;
  }
  
  save(list);
  return maskProvider(p);
}

// Persist cooldown state (used by failback engine) without masking.
// Also clears expired cooldowns so stale state does not accumulate in settings.
export function saveCooldown(id: string, keyId: string, cooldownUntil: number): void {
  const list = load();
  const p = list.find((x) => x.id === id);
  if (!p) return;
  const k = p.keys.find((x) => x.id === keyId);
  if (!k) return;
  const now = Date.now();
  k.cooldownUntil = cooldownUntil;
  // Clear expired cooldowns across all providers so settings stays clean.
  // We do NOT remove the key itself — only the stale cooldown timestamp.
  for (const prov of list) {
    for (const key of prov.keys) {
      if (key.cooldownUntil && key.cooldownUntil <= now) {
        key.cooldownUntil = undefined;
      }
    }
  }
  save(list);
}

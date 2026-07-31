import OpenAI from 'openai';
import { getProviderRaw } from '../config/providers.js';
import { logger } from '../util/logger.js';
import { detectModelCapabilities, GROQ_MODELS, OPENAI_MODELS, ANTHROPIC_MODELS } from './capabilities.js';
import type { Provider, ModelInfo } from '../types.js';

// Derive context window and max output tokens from API response or known tables
export function deriveLimits(raw: any, known?: ModelInfo): { contextWindow: number; maxTokens: number } {
  if (known) {
    return { contextWindow: known.contextWindow, maxTokens: known.maxTokens };
  }

  // Try to extract from API response metadata (OpenRouter and others include this)
  let contextWindow = raw?.context_length || raw?.max_context_length || raw?.top_provider?.context_length;
  let maxOut = raw?.top_provider?.max_completion_tokens || raw?.max_output_tokens;

  // Fallback to defaults if metadata is missing
  if (!contextWindow || contextWindow === 0) contextWindow = 8192;
  if (!maxOut || maxOut === 0) {
    // If we have a real context window but no output cap, derive a reasonable one
    maxOut = Math.min(contextWindow, 32768);
  }

  return { contextWindow, maxTokens: maxOut };
}

const ANTHROPIC_KNOWN = [
  'claude-3-5-sonnet-20241022',
  'claude-3-5-haiku-20241022',
  'claude-3-opus-20240229',
  'claude-3-sonnet-20240229',
  'claude-3-haiku-20240307'
];

// Load available models from a provider with capability detection
// OpenAI-compatible -> GET /models with enrichment
// Anthropic -> static known list with full metadata
export async function loadModels(providerId: string): Promise<ModelInfo[]> {
  const provider = getProviderRaw(providerId);
  if (!provider) throw new Error('Provider not found');

  if (provider.format === 'anthropic') {
    // Return Anthropic models with full metadata
    return ANTHROPIC_KNOWN.map(id => {
      const known = ANTHROPIC_MODELS[id];
      if (known) return { ...known };
      
      // Unknown Anthropic model
      return {
        id,
        name: id,
        capabilities: ['text', 'vision', 'reasoning'],
        contextWindow: 200000,
        maxTokens: 8192,
        enabled: true,
        metadata: { speed: 'medium', quality: 'high', vendor: 'Anthropic' }
      } as ModelInfo;
    });
  }

  const key = provider.keys.find((k) => k.enabled) || provider.keys[0];
  if (!key) throw new Error('No API key configured for this provider');
  
  const client = new OpenAI({ apiKey: key.key, baseURL: provider.baseUrl });
  
  try {
    const list = await client.models.list();

    // Check if this is Groq based on base URL
    const isGroq = /groq/i.test(provider.baseUrl);
    const isOpenAI = /openai/i.test(provider.baseUrl);

    // Enrich with metadata — map each raw model entry keeping its data
    const models: ModelInfo[] = list.data
      .filter((m: any) => m.id) // Skip models with no ID
      .map((rawModel: any) => {
        const id = rawModel.id;

      // Check known models first
      if (isGroq && GROQ_MODELS[id]) {
        return { ...GROQ_MODELS[id] };
      }
      if (isOpenAI && OPENAI_MODELS[id]) {
        return { ...OPENAI_MODELS[id] };
      }

      // Detect capabilities for unknown models
        const capabilities = detectModelCapabilities(id, provider.format);
        const limits = deriveLimits(rawModel, undefined);

        return {
          id,
          name: id,
          capabilities,
          contextWindow: limits.contextWindow,
          maxTokens: limits.maxTokens,
          enabled: true,
          metadata: {
            speed: 'medium',
            quality: 'medium',
            vendor: isGroq ? 'Groq' : isOpenAI ? 'OpenAI' : 'Custom'
          }
        } as ModelInfo;
      });
    
    // Sort: chat models first, then by capability richness
    models.sort((a, b) => {
      const aChat = a.capabilities.includes('text') ? 0 : 1;
      const bChat = b.capabilities.includes('text') ? 0 : 1;
      if (aChat !== bChat) return aChat - bChat;
      return b.capabilities.length - a.capabilities.length;
    });
    
    return models;
  } catch (e: any) {
    logger.warn('Failed to list models via API:', e?.message);
    throw new Error(
      'Could not list models from this endpoint. ' +
        (e?.message ? `(${e.message}) ` : '') +
        'You can still set a model name manually.'
    );
  }
}

// Validate that at least one key works with a tiny completion (used by Test).
export async function testProvider(providerId: string): Promise<{ ok: boolean; model?: string; error?: string }> {
  const { getProviderRaw } = await import('../config/providers.js');
  const provider = getProviderRaw(providerId);
  if (!provider) return { ok: false, error: 'Provider not found' };
  const key = provider.keys.find((k) => k.enabled) || provider.keys[0];
  if (!key) return { ok: false, error: 'No API key configured' };
  
  const model = provider.defaultModel || 
    (provider.format === 'anthropic' ? ANTHROPIC_KNOWN[0] : provider.models[0]?.id);
  if (!model) return { ok: false, error: 'No model selected (load models first)' };

  try {
    const { openaiChat } = await import('./openai.js');
    const { anthropicChat } = await import('./anthropic.js');
    const msgs = [{ role: 'user' as const, content: 'Reply with the single word: OK' }];
    if (provider.format === 'openai') {
      await openaiChat(provider, key, model, { messages: msgs, maxTokens: 5 });
    } else {
      await anthropicChat(provider, key, model, { messages: msgs, maxTokens: 5 });
    }
    return { ok: true, model };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

import OpenAI from 'openai';
import { pipeline, type Pipeline } from '@xenova/transformers';
import { getSettings } from '../config/settings.js';
import { getProviderRaw, getEnabledProviders } from '../config/providers.js';
import { logger } from '../util/logger.js';

let localPipeline: any = null;

async function getLocalPipeline(): Promise<any> {
  if (!localPipeline) {
    logger.info('Loading local embedding model (Xenova/all-MiniLM-L6-v2)…');
    localPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    logger.info('Local embedding model ready');
  }
  return localPipeline;
}

async function localEmbed(texts: string[]): Promise<number[][]> {
  const p = await getLocalPipeline();
  const out: number[][] = [];
  for (const t of texts) {
    const o = await p(t, { pooling: 'mean', normalize: true });
    out.push(Array.from(o.data as Float32Array));
  }
  return out;
}

async function providerEmbed(providerId: string, texts: string[]): Promise<number[][]> {
  const provider = getProviderRaw(providerId);
  if (!provider) throw new Error('Embedding provider not found');
  if (provider.format === 'anthropic') {
    throw new Error('Anthropic providers have no embeddings endpoint');
  }
  const settings = getSettings();
  const key = provider.keys.find((k) => k.enabled)?.key || provider.keys[0]?.key || '';
  const client = new OpenAI({ apiKey: key, baseURL: provider.baseUrl });
  const r = await client.embeddings.create({ model: settings.embeddingModel, input: texts });
  return r.data.map((d) => d.embedding);
}

// Providers that have been observed to not support embeddings (e.g. chat-only
// providers like Groq that return 404 for text-embedding-3-small). Cached for the
// process lifetime so we skip the doomed network call on every chunk/query.
const unsupportedEmbedProviders = new Set<string>();

function isEmbeddingErrorNonRetryable(e: any): boolean {
  const status = e?.status || e?.statusCode;
  if (status === 404 || status === 400 || status === 401 || status === 403) return true;
  const msg = e?.message || '';
  return /does not exist|not have access|no embeddings|not supported|not found/i.test(msg);
}

// Public: embed a batch of texts using provider first, local model as failback.
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  const settings = getSettings();

  // Resolve embedding provider
  const embProviderId = settings.embeddingProviderId;
  const provider =
    (embProviderId && getProviderRaw(embProviderId)) ||
    getEnabledProviders().find((p) => p.format === 'openai') ||
    getEnabledProviders()[0];

  if (provider && provider.format === 'openai' && !unsupportedEmbedProviders.has(provider.id)) {
    try {
      return await providerEmbed(provider.id, texts);
    } catch (e: any) {
      if (isEmbeddingErrorNonRetryable(e)) {
        // Mark once and stop retrying this provider — fall back to local embeddings.
        unsupportedEmbedProviders.add(provider.id);
        logger.warn(
          `Provider "${provider.name}" does not support embeddings (${e?.status || e?.message}); using the local embedding model instead.`
        );
      } else {
        logger.warn('Provider embeddings failed:', e?.message || e);
      }
      if (!settings.localEmbeddingFallback) throw e;
    }
  }
  if (settings.localEmbeddingFallback) {
    return await localEmbed(texts);
  }
  throw new Error('No embedding source available');
}

export async function embedOne(text: string): Promise<number[]> {
  const [v] = await embedTexts([text]);
  return v;
}

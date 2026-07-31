import { getEnabledProviders, getProviderRaw, saveCooldown } from '../config/providers.js';
import { getSettings } from '../config/settings.js';
import { logger } from '../util/logger.js';
import type { Provider, ProviderKey } from '../types.js';

// ---------------------------------------------------------------------------
// Voice engine — server-side Speech-to-Text and Text-to-Speech.
//
// Designed for Groq (https://api.groq.com/openai/v1) but works with ANY
// OpenAI-compatible provider that exposes /audio/transcriptions and
// /audio/speech. Groq free-tier limits handled by design:
//   STT  whisper-large-v3(-turbo): 20 req/min, 2K req/day per key
//   TTS  canopylabs/orpheus-v1-english: 10 req/min, 100 req/day per key
// → multiple API keys are load-balanced round-robin, and a key that hits a
//   rate limit is cooled down while the next key / model / provider takes over.
// ---------------------------------------------------------------------------

export const STT_MODELS = ['whisper-large-v3-turbo', 'whisper-large-v3'];
export const TTS_MODELS = ['canopylabs/orpheus-v1-english'];
export const TTS_VOICES = ['autumn', 'diana', 'hannah', 'austin', 'daniel', 'troy'];

export interface VoiceResult {
  buffer?: Buffer;
  text?: string;
  providerId: string;
  model: string;
  keyId: string;
}

// Round-robin cursors per provider id (in-memory; resets with the process).
const rrCursor = new Map<string, number>();

// Resolve candidate providers: openai-format only, Groq first, then by priority.
function resolveVoiceProviders(providerId?: string): Provider[] {
  if (providerId) {
    const p = getProviderRaw(providerId);
    return p && p.enabled && p.format === 'openai' ? [p] : [];
  }
  const all = getEnabledProviders().filter((p) => p.format === 'openai');
  return all.sort((a, b) => {
    const ag = /groq/i.test(a.baseUrl) ? 0 : 1;
    const bg = /groq/i.test(b.baseUrl) ? 0 : 1;
    return ag - bg || a.priority - b.priority;
  });
}

// Keys of a provider in round-robin order, skipping cooled-down / disabled keys.
function rotatedKeys(provider: Provider): ProviderKey[] {
  const now = Date.now();
  const keys = provider.keys.filter((k) => k.enabled && (!k.cooldownUntil || k.cooldownUntil <= now));
  if (!keys.length) return [];
  const start = rrCursor.get(provider.id) ?? 0;
  rrCursor.set(provider.id, start + 1);
  return keys.map((_, i) => keys[(start + i) % keys.length]);
}

function statusOf(err: any): number | undefined {
  return err?.status ?? err?.statusCode;
}

async function fetchWithStatus(url: string, init: RequestInit): Promise<Response> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err: any = new Error(`Voice API ${res.status}: ${body.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return res;
}

// Is this error a "model doesn't exist / wrong endpoint" error? → try next model.
function isModelError(status?: number, msg?: string): boolean {
  if (status === 404) return true;
  if (status === 400 && /model|decommissioned|not found|does not exist/i.test(msg || '')) return true;
  return false;
}

// Generic failover driver: tries provider → key (round-robin) → model.
// `attempt` performs the HTTP call and returns the parsed result.
async function withVoiceFailover<T>(
  models: string[],
  attempt: (baseUrl: string, apiKey: string, model: string) => Promise<T>,
  providerId?: string,
  label = 'voice'
): Promise<{ value: T; providerId: string; model: string; keyId: string }> {
  const settings = getSettings();
  const providers = resolveVoiceProviders(providerId);
  if (!providers.length) {
    throw new Error(
      `No OpenAI-compatible provider configured for ${label}. Add a Groq provider (https://api.groq.com/openai/v1) with one or more API keys.`
    );
  }

  let lastErr: any;
  for (const provider of providers) {
    const keys = rotatedKeys(provider);
    if (!keys.length) continue;
    for (const key of keys) {
      for (const model of models) {
        try {
          const value = await attempt(provider.baseUrl, key.key, model);
          return { value, providerId: provider.id, model, keyId: key.id };
        } catch (err: any) {
          lastErr = err;
          const status = statusOf(err);
          if (status && settings.triggerCodes.includes(status)) {
            // Rate limit / credits / server error → cool this key down, try next key
            saveCooldown(provider.id, key.id, Date.now() + settings.backoffMs);
            logger.warn(`Voice ${label}: "${provider.name}" key "${key.label}" hit ${status} → cooldown, rotating key`);
            break; // next key
          }
          if (isModelError(status, err?.message)) {
            logger.warn(`Voice ${label}: model ${model} unavailable on "${provider.name}" → trying next model`);
            continue; // next model
          }
          throw err; // genuine client error — surface it
        }
      }
    }
  }
  throw lastErr || new Error(`All voice providers/keys/models exhausted for ${label}`);
}

// ---- Speech to Text -------------------------------------------------------

export async function transcribeAudio(
  audio: Buffer,
  mime: string,
  opts: { providerId?: string; language?: string } = {}
): Promise<VoiceResult> {
  const ext = mime.includes('webm') ? 'webm' : mime.includes('ogg') ? 'ogg' : mime.includes('mp4') ? 'm4a' : 'wav';
  const { value, providerId, model, keyId } = await withVoiceFailover(
    STT_MODELS,
    async (baseUrl, apiKey, model) => {
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(audio)], { type: mime }), `speech.${ext}`);
      form.append('model', model);
      form.append('response_format', 'json');
      if (opts.language) form.append('language', opts.language);
      const res = await fetchWithStatus(`${baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form
      });
      const json: any = await res.json();
      return String(json?.text || '').trim();
    },
    opts.providerId,
    'STT'
  );
  return { text: value, providerId, model, keyId };
}

// ---- Text to Speech -------------------------------------------------------

export async function synthesizeSpeech(
  text: string,
  opts: { providerId?: string; voice?: string } = {}
): Promise<VoiceResult> {
  const input = text.replace(/[#*`>\-[\]()]/g, '').slice(0, 1800); // strip markdown, respect token limits
  const voice = opts.voice && TTS_VOICES.includes(opts.voice) ? opts.voice : 'autumn';
  const { value, providerId, model, keyId } = await withVoiceFailover(
    TTS_MODELS,
    async (baseUrl, apiKey, model) => {
      const res = await fetchWithStatus(`${baseUrl}/audio/speech`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, voice, input, response_format: 'wav' })
      });
      return Buffer.from(await res.arrayBuffer());
    },
    opts.providerId,
    'TTS'
  );
  return { buffer: value, providerId, model, keyId };
}

// ---- Status / capability discovery ---------------------------------------

export function voiceStatus() {
  const providers = resolveVoiceProviders().map((p) => ({
    id: p.id,
    name: p.name,
    baseUrl: p.baseUrl,
    groq: /groq/i.test(p.baseUrl),
    activeKeys: p.keys.filter((k) => k.enabled && (!k.cooldownUntil || k.cooldownUntil <= Date.now())).length,
    totalKeys: p.keys.length
  }));
  return {
    serverVoiceAvailable: providers.some((p) => p.activeKeys > 0),
    providers,
    sttModels: STT_MODELS,
    ttsModels: TTS_MODELS,
    ttsVoices: TTS_VOICES
  };
}

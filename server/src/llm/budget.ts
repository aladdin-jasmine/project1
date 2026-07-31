import type { ChatMessage, Provider } from '../types.js';

// Groq's free tier bills input + output against one per-minute allowance, so a
// request sized only against the context window still 413s. Providers whose
// throughput limit is lower than their context window are listed here.
const TPM_LIMITS: { match: RegExp; tpm: number }[] = [
  { match: /api\.groq\.com/i, tpm: 12000 }
];

export function estimateTokens(text: string): number {
  return Math.ceil((text || '').length / 3.6);
}

export function messagesTokens(messages: ChatMessage[]): number {
  // ~4 tokens of role/separator overhead per message.
  return messages.reduce((n, m) => n + estimateTokens(m.content) + 4, 0);
}

export function providerTpm(provider: Provider): number | undefined {
  return TPM_LIMITS.find((l) => l.match.test(provider.baseUrl))?.tpm;
}

export interface Budget {
  maxInputTokens: number;
  maxOutputTokens: number;
}

/**
 * Split the available allowance between prompt and completion. `desiredOutput`
 * is honoured when it fits; otherwise input is trimmed first so the model keeps
 * enough room to finish its JSON instead of being cut off mid-structure.
 */
export function resolveBudget(
  provider: Provider,
  modelId: string,
  desiredOutput: number
): Budget {
  const info = provider.models?.find((m) => m.id === modelId);
  const contextWindow = info?.contextWindow || 8192;
  const modelMaxOut = info?.maxTokens || Math.floor(contextWindow / 2);
  const tpm = providerTpm(provider);

  // Reserve 5% headroom for tokenizer drift in our character-based estimate.
  const allowance = Math.floor((tpm ? Math.min(tpm, contextWindow) : contextWindow) * 0.95);

  const maxOutputTokens = Math.max(512, Math.min(desiredOutput, modelMaxOut, Math.floor(allowance * 0.6)));
  const maxInputTokens = Math.max(1000, allowance - maxOutputTokens);
  return { maxInputTokens, maxOutputTokens };
}

/**
 * Trim messages to `maxInputTokens`, preserving system messages and the most
 * recent turns. Oversized single messages are truncated from the middle so the
 * task instructions at the end of a prompt survive.
 */
export function fitMessages(messages: ChatMessage[], maxInputTokens: number): ChatMessage[] {
  const system = messages.filter((m) => m.role === 'system');
  const rest = messages.filter((m) => m.role !== 'system');

  let used = messagesTokens(system);
  if (used > maxInputTokens) {
    // Even the instructions overflow: keep their head and tail.
    return system.map((m) => ({ ...m, content: clampMiddle(m.content, (maxInputTokens - 8) * 3.6) }));
  }

  const kept: ChatMessage[] = [];
  for (let i = rest.length - 1; i >= 0; i--) {
    const m = rest[i];
    const cost = estimateTokens(m.content) + 4;
    if (used + cost <= maxInputTokens) {
      kept.unshift(m);
      used += cost;
      continue;
    }
    const available = maxInputTokens - used - 4;
    if (available > 200) {
      kept.unshift({ ...m, content: clampMiddle(m.content, available * 3.6) });
    }
    break;
  }
  return [...system, ...kept];
}

function clampMiddle(text: string, maxChars: number): string {
  const limit = Math.floor(maxChars);
  if (text.length <= limit) return text;
  const head = Math.floor(limit * 0.65);
  const tail = limit - head - 40;
  return `${text.slice(0, head)}\n\n[...source material trimmed to fit the model's limit...]\n\n${text.slice(-Math.max(tail, 0))}`;
}

import Anthropic from '@anthropic-ai/sdk';
import { fitMessages, resolveBudget } from './budget.js';
import type { ChatRequest, Provider, ProviderKey } from '../types.js';

// Run a chat completion against an Anthropic-compatible endpoint.
// Note: provider.baseUrl is expected to be the host root (a trailing /v1 is stripped).
export async function anthropicChat(
  provider: Provider,
  key: ProviderKey,
  model: string,
  req: ChatRequest,
  onToken?: (delta: string) => void
): Promise<string> {
  const baseURL = provider.baseUrl.replace(/\/v1\/?$/, '');
  const client = new Anthropic({ apiKey: key.key, baseURL });
  const budget = resolveBudget(provider, model, req.maxTokens ?? 4000);
  const fitted = fitMessages(req.messages, budget.maxInputTokens);
  const system = fitted
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n');
  const messages = fitted
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  if (onToken) {
    const stream = client.messages.stream({
      model,
      max_tokens: budget.maxOutputTokens,
      system: system || undefined,
      messages
    });
    let content = '';
    stream.on('text', (t: string) => {
      content += t;
      onToken(t);
    });
    const final = await stream.finalMessage();
    if (final?.stop_reason === 'max_tokens') req.truncated = true;
    return content;
  }

  const r = await client.messages.create({
    model,
    max_tokens: budget.maxOutputTokens,
    system: system || undefined,
    messages
  });
  if (r.stop_reason === 'max_tokens') req.truncated = true;
  return r.content
    .map((c: any) => (c.type === 'text' ? c.text : ''))
    .join('');
}

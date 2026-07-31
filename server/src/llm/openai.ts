import OpenAI from 'openai';
import { fitMessages, resolveBudget } from './budget.js';
import type { ChatRequest, Provider, ProviderKey } from '../types.js';

// Run a chat completion against an OpenAI-compatible endpoint.
// Returns the full text (non-stream) or streams deltas via onToken.
export async function openaiChat(
  provider: Provider,
  key: ProviderKey,
  model: string,
  req: ChatRequest,
  onToken?: (delta: string) => void
): Promise<string> {
  const client = new OpenAI({ apiKey: key.key, baseURL: provider.baseUrl });
  const budget = resolveBudget(provider, model, req.maxTokens ?? 4000);
  const messages = fitMessages(req.messages, budget.maxInputTokens);
  const params: any = {
    model,
    messages: messages as any,
    temperature: req.temperature ?? 0.7,
    max_tokens: budget.maxOutputTokens
  };
  if (onToken) {
    params.stream = true;
    try {
      const stream: any = await client.chat.completions.create(params);
      let content = '';
      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta?.content || '';
        if (delta) {
          content += delta;
          onToken(delta);
        }
      }
      return content;
    } catch (err: any) {
      // Re-throw with proper status for failback handling
      const status = err?.status || err?.statusCode;
      const error: any = new Error(err?.message || 'OpenAI API error');
      if (status) error.status = status;
      throw error;
    }
  }
  try {
    const r = await client.chat.completions.create(params);
    const choice = r.choices?.[0];
    // Surface a hit output cap so callers can continue rather than silently
    // accepting a half-finished answer (this is what truncated notes to a stub).
    if (choice?.finish_reason === 'length') req.truncated = true;
    return choice?.message?.content || '';
  } catch (err: any) {
    const status = err?.status || err?.statusCode;
    const error: any = new Error(err?.message || 'OpenAI API error');
    if (status) error.status = status;
    throw error;
  }
}

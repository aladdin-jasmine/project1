// Context compression to prevent token limit errors (413)
import { chat } from '../llm/client.js';
import { logger } from '../util/logger.js';
import type { ChatRequest } from '../types.js';

/**
 * Estimates token count from text (rough approximation).
 * Uses the same character-per-token ratio as llm/budget.ts so that
 * compression decisions match the actual fitting done at request time.
 */
export function estimateTokens(text: string): number {
  return Math.ceil((text || '').length / 3.6);
}

/**
 * Compresses context to fit within token limits while preserving key information
 * @param context - The full context text to compress
 * @param maxTokens - Maximum tokens allowed for the model
 * @param options - Compression options
 * @returns Compressed context
 */
export async function compressContext(
  context: string,
  maxTokens: number,
  options: {
    preserveRecent?: number; // Percentage of recent content to keep (default: 70%)
    useLLMSummarization?: boolean; // Use LLM to summarize old content (default: true)
    req?: ChatRequest; // For LLM calls
  } = {}
): Promise<string> {
  const currentTokens = estimateTokens(context);
  const targetChars = maxTokens * 4;
  
  // If already under limit, return as-is
  if (currentTokens <= maxTokens * 0.8) {
    logger.info(`[Compress] Context OK: ${currentTokens} tokens (limit: ${maxTokens})`);
    return context;
  }

  logger.warn(`[Compress] Context too large: ${currentTokens} tokens (limit: ${maxTokens}). Compressing...`);

  const preserveRecent = options.preserveRecent ?? 0.7;
  const useLLMSummarization = options.useLLMSummarization ?? true;

  // Strategy 1: Keep most recent portion (70% by default)
  const recentChars = Math.floor(targetChars * preserveRecent);
  const recentPortion = context.slice(-recentChars);

  // Strategy 2: Summarize or truncate older portion
  const olderPortion = context.slice(0, -recentChars);
  
  let compressedOlder = '';
  
  if (useLLMSummarization && options.req && olderPortion.length > 1000) {
    try {
      // Use LLM to extract key facts from older context
      compressedOlder = await extractKeyFacts(olderPortion, options.req);
      logger.info(`[Compress] LLM summarized ${olderPortion.length} chars to ${compressedOlder.length} chars`);
    } catch (error) {
      logger.warn('[Compress] LLM summarization failed, using truncation:', error instanceof Error ? error.message : String(error));
      // Fallback to simple truncation
      compressedOlder = truncateIntelligently(olderPortion, Math.floor(targetChars * 0.3));
    }
  } else {
    // Simple intelligent truncation
    compressedOlder = truncateIntelligently(olderPortion, Math.floor(targetChars * 0.3));
  }

  const result = compressedOlder ? `${compressedOlder}\n\n---\n\n${recentPortion}` : recentPortion;
  const finalTokens = estimateTokens(result);
  
  logger.info(`[Compress] Compressed ${currentTokens} → ${finalTokens} tokens (${Math.round(finalTokens/currentTokens*100)}%)`);
  
  return result;
}

/**
 * Uses LLM to extract key facts and definitions from text
 */
async function extractKeyFacts(text: string, req: ChatRequest): Promise<string> {
  const result = await chat({
    ...req,
    messages: [
      {
        role: 'system',
        content: 'You are a summarization expert. Extract ONLY the key facts, definitions, formulas, and critical information from the provided text. Be extremely concise. Remove examples, elaborations, and redundant explanations. Output as bullet points.'
      },
      {
        role: 'user',
        content: `Extract key facts from this text:\n\n${text.slice(0, 8000)}`
      }
    ],
    maxTokens: 1000,
    temperature: 0.3
  });

  return `[Summarized older context]\n${result.content}`;
}

/**
 * Intelligently truncates text, preserving complete sentences and paragraphs
 */
function truncateIntelligently(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;

  // Try to break at paragraph boundary
  const truncated = text.slice(0, maxChars);
  const lastParagraph = truncated.lastIndexOf('\n\n');
  if (lastParagraph > maxChars * 0.7) {
    return truncated.slice(0, lastParagraph) + '\n\n[... older content truncated ...]';
  }

  // Try to break at sentence boundary
  const lastPeriod = truncated.lastIndexOf('. ');
  if (lastPeriod > maxChars * 0.8) {
    return truncated.slice(0, lastPeriod + 1) + ' [... truncated ...]';
  }

  // Last resort: hard truncate
  return truncated + '... [truncated]';
}

/**
 * Compresses chat conversation history to prevent token overflow
 */
export async function compressChatHistory(
  messages: Array<{ role: string; content: string }>,
  maxTokens: number,
  options?: { req?: ChatRequest }
): Promise<Array<{ role: string; content: string }>> {
  // Include per-message overhead (role + separator) to match budget.ts messagesTokens(),
  // so the compression decision matches the actual fitting done at request time.
  const totalTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content) + 4, 0);
  
  if (totalTokens <= maxTokens * 0.8) {
    return messages;
  }

  logger.warn(`[Compress] Chat history ${totalTokens} tokens > ${maxTokens} limit. Compressing...`);

  // Strategy: Keep system message + last N messages + summarize middle
  const systemMessages = messages.filter(m => m.role === 'system');
  const conversationMessages = messages.filter(m => m.role !== 'system');
  
  // Keep last 3-5 message pairs (user + assistant)
  const keepRecent = 6;
  const recentMessages = conversationMessages.slice(-keepRecent);
  const recentTokens = recentMessages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  
  const olderMessages = conversationMessages.slice(0, -keepRecent);
  
  if (olderMessages.length === 0) {
    // Even recent messages are too long - truncate individual messages
    return [
      ...systemMessages,
      ...recentMessages.map(m => ({
        ...m,
        content: m.content.slice(0, (maxTokens * 4) / recentMessages.length)
      }))
    ];
  }

  // Summarize older messages
  const summary = await summarizeConversation(olderMessages, options?.req);
  
  return [
    ...systemMessages,
    {
      role: 'system',
      content: `[Previous conversation summary]\n${summary}`
    },
    ...recentMessages
  ];
}

async function summarizeConversation(
  messages: Array<{ role: string; content: string }>,
  req?: ChatRequest
): Promise<string> {
  if (!req) {
    // Simple truncation fallback
    const combined = messages.map(m => `${m.role}: ${m.content}`).join('\n');
    return truncateIntelligently(combined, 500);
  }

  try {
    const conversationText = messages
      .map(m => `${m.role === 'user' ? 'Student' : 'Assistant'}: ${m.content}`)
      .join('\n\n');

    const result = await chat({
      ...req,
      messages: [
        {
          role: 'system',
          content: 'Summarize the key points and questions from this conversation. Focus on topics discussed, clarifications made, and concepts explained. Be extremely concise (max 200 words).'
        },
        {
          role: 'user',
          content: conversationText.slice(0, 10000)
        }
      ],
      maxTokens: 500,
      temperature: 0.3
    });

    return result.content;
  } catch (error) {
    logger.warn('[Compress] Conversation summarization failed:', error instanceof Error ? error.message : String(error));
    const combined = messages.map(m => `${m.role}: ${m.content}`).join('\n');
    return truncateIntelligently(combined, 500);
  }
}

/**
 * Validates and compresses context before API call
 */
export async function validateAndCompressContext(
  context: string,
  maxModelTokens: number,
  options: {
    reservedForPrompt?: number; // Tokens reserved for prompt/response
    req?: ChatRequest;
  } = {}
): Promise<string> {
  const reservedTokens = options.reservedForPrompt ?? 2000;
  const availableTokens = maxModelTokens - reservedTokens;
  
  const contextTokens = estimateTokens(context);
  
  if (contextTokens <= availableTokens) {
    return context;
  }

  logger.warn(
    `[Validate] Context ${contextTokens} tokens exceeds available ${availableTokens}. ` +
    `Model limit: ${maxModelTokens}, Reserved: ${reservedTokens}`
  );

  return compressContext(context, availableTokens, {
    useLLMSummarization: true,
    req: options.req
  });
}

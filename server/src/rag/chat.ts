import { chat } from '../llm/client.js';
import { retrieve } from './retrieve.js';
import { getDoc } from './vectorstore.js';
import { readJson, writeJson } from '../db/store.js';
import { getSettings } from '../config/settings.js';
import { getProject } from '../config/projects.js';
import { compressChatHistory, validateAndCompressContext, estimateTokens } from './compress.js';
import {
  getMemory,
  buildMemoryPrompt,
  recordQuestion,
  recordConcept,
  recordMistake
} from '../db/memory.js';
import { logChat } from '../db/postgres.js';
import type { ChatRequest, ChatResult, ChatSession, StoredMsg, LearningStyle, ExplainLevel } from '../types.js';
import { logger } from '../util/logger.js';

export interface Citation {
  index: number;
  docId: string;
  docName: string;
  snippet: string;
  page?: number;
  heading?: string;
  subject?: string;
  score: number;
}

export interface RagChatResult extends ChatResult {
  citations: Citation[];
  confidence: number;
  sessionId: string;
  memoryNote?: string;
  truncated?: boolean;
}

// ---------- Chat session persistence ----------
function loadSessions(): ChatSession[] {
  return readJson<ChatSession[]>('chats', []);
}
function saveSessions(s: ChatSession[]): void {
  writeJson('chats', s);
}
function getSession(id?: string): ChatSession {
  const all = loadSessions();
  let s = id ? all.find((x) => x.id === id) : undefined;
  if (!s) {
    s = {
      id: id || crypto.randomUUID(),
      title: 'New chat',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: []
    };
    all.unshift(s);
    saveSessions(all);
  }
  return s;
}
function appendMsg(sessionId: string, msg: StoredMsg): void {
  const all = loadSessions();
  const s = all.find((x) => x.id === sessionId);
  if (!s) return;
  if (s.messages.length === 0 && msg.role === 'user') s.title = msg.content.slice(0, 50);
  s.messages.push(msg);
  s.updatedAt = new Date().toISOString();
  if (s.messages.length > 60) s.messages = s.messages.slice(-60);
  saveSessions(all);
}

function stylePrompt(style: LearningStyle): string {
  switch (style) {
    case 'visual':
      return 'Favour visual explanations; include diagrams (use ```mermaid fenced blocks) and examples.';
    case 'auditory':
      return 'Explain as if speaking aloud; use analogies and conversational phrasing.';
    case 'reading':
      return 'Give clear structured text with headings and bullet points.';
    case 'kinesthetic':
      return 'Include hands-on examples, exercises, and "try this" steps.';
    default:
      return 'Adapt your style to the question; include a diagram (```mermaid) when it aids understanding.';
  }
}

// Compress long history into a short summary to save tokens.
// Updated to use new compression utility for better reliability
async function compressHistory(messages: { role: string; content: string }[], thresholdTokens: number, req?: ChatRequest): Promise<{ role: string; content: string }[]> {
  const estimatedTokens = estimateTokens(messages.map(m => m.content).join('\n'));

  if (estimatedTokens <= thresholdTokens || messages.length < 4) {
    return messages;
  }

  logger.info(`[Chat] Compressing history: ${estimatedTokens} tokens → target ${thresholdTokens}`);

  try {
    // Use new compression utility
    return await compressChatHistory(messages, thresholdTokens, { req });
  } catch (error) {
    logger.warn('[Chat] Compression failed, using fallback:', error instanceof Error ? error.message : String(error));
    // Fallback: keep only recent messages
    return messages.slice(-4);
  }
}

// Best-effort: extract concepts the student knows / struggles with from a turn.
async function updateMemory(query: string, answer: string): Promise<string | undefined> {
  try {
    const m = getMemory();
    recordQuestion(query);
    const out = await chat({
      messages: [
        {
          role: 'system',
          content:
            'From the student question and the assistant answer, identify concepts. Return ONLY JSON: {"known":[..],"unknown":[..],"mistakes":[{"concept":string,"detail":string}]}. Keep each list to at most 4 items.'
        },
        { role: 'user', content: `Q: ${query}\n\nA: ${answer.slice(0, 1200)}` }
      ],
      maxTokens: 400
    });
    let t = out.content.trim();
    const f = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (f) t = f[1].trim();
    const s = t.indexOf('{');
    const e = t.lastIndexOf('}');
    if (s < 0 || e < 0) return undefined;
    const parsed = JSON.parse(t.slice(s, e + 1));
    (parsed.known || []).forEach((c: string) => recordConcept(c, true));
    (parsed.unknown || []).forEach((c: string) => recordConcept(c, false));
    (parsed.mistakes || []).forEach((x: any) => recordMistake(x.concept, x.detail));
    return 'Memory updated with ' + [...(parsed.known || []), ...(parsed.unknown || [])].slice(0, 4).join(', ');
  } catch (err) {
    return undefined;
  }
}

function citationConfidence(chunks: { score?: number }[]): number {
  const top = chunks.slice(0, 3).map((c) => c.score || 0);
  if (!top.length) return 50;
  const avg = top.reduce((a, b) => a + b, 0) / top.length;
  return Math.max(35, Math.min(99, Math.round(avg * 100)));
}

export async function ragChat(
  req: ChatRequest,
  onToken?: (delta: string) => void
): Promise<RagChatResult> {
  const settings = getSettings();
  const project = getProject(req.projectId);
  const useMemory = req.useMemory ?? project?.memoryEnabled ?? true;

  const lastUser = [...req.messages].reverse().find((m) => m.role === 'user');
  const query = lastUser?.content || '';

  // Retrieve context — use balanced number of chunks, limit total context size
  const chunks = await retrieve(query, 4, { docIds: req.docIds, collection: req.collection });
  const contextStr = chunks
    .map((c, i) => {
      const d = getDoc(c.docId);
      const loc = [c.meta?.page ? `p.${c.meta.page}` : '', c.meta?.heading, d?.name].filter(Boolean).join(' · ');
      const text = c.text.length > 1200 ? c.text.slice(0, 1200) + '...' : c.text;
      return `[${i + 1}] (${loc})\n${text}`;
    })
    .join('\n\n');

  // Memory
  const memoryBlock = useMemory ? buildMemoryPrompt(getMemory()) : '';

  // Restructured prompt: grounding rule FIRST, context immediately after, then instructions
  const sys = `You are StudyForge, an expert, intelligent, and thorough study assistant. Your highest priority rules:
1. Provide DETAILED, COMPREHENSIVE answers that fully address the student's question.
2. Base every factual claim on the retrieved context below. Never invent facts, formulas, or concepts not present in the material.
3. If the context lacks the answer, say so clearly and list what information would be needed.
4. Write QUALITY responses — at least 3-5 sentences per concept. Elaborate, explain, use examples. Never give one-line answers.

--- RETRIEVED CONTEXT (${chunks.length} sources) ---
${contextStr || '(No relevant documents found in your knowledge base. Answer from general knowledge but clearly state when you are doing so.)'}
--- END CONTEXT ---

Cite every factual claim with its source marker like [1], [2] so the student can verify. Use [N] when you reference fact from chunk N.
${stylePrompt(req.learningStyle || settings.learningStyle)}
${req.explainLevel ? `Explain at a "${req.explainLevel}" level of depth. Provide thorough, detailed explanations appropriate for that level.` : ''}
When a diagram helps, include a \`\`\`mermaid fenced code block (flowchart/sequence).
Always write detailed, thorough responses. Cover definitions, explanations, examples, applications, and key takeaways.${memoryBlock}`;

  // History (session) + optional compression
  const session = getSession(req.sessionId);
  const prior: { role: string; content: string }[] = session.messages.map((m) => ({ role: m.role, content: m.content }));
  const history = settings.contextCompression
    ? await compressHistory([...prior, ...req.messages.filter((m) => m.role !== 'system')], settings.compressionTokens, req)
    : [...prior, ...req.messages.filter((m) => m.role !== 'system')];

  // System message with context goes FIRST, then history
  const sysMsg = { role: 'system' as const, content: sys };
  const messages = [sysMsg, ...history] as any;

  // Chat runs as a single request — it cannot be split across keys the way a
  // notes pack can — so it relies on key/model rotation inside the client for
  // throughput. Its output cap comes from the chat task config rather than a
  // hardcoded value, which is what used to clip long answers at ~1500 tokens.
  const chatCap = req.maxTokens ?? settings.taskConfigs?.chat?.maxTokens ?? 4000;
  const result = await chat(
    { ...req, taskType: req.taskType || 'chat', messages, temperature: req.temperature ?? 0.4, maxTokens: chatCap },
    onToken
  );

  const citations: Citation[] = chunks.map((c, i) => {
    const d = getDoc(c.docId);
    return {
      index: i + 1,
      docId: c.docId,
      docName: d?.name || 'doc',
      snippet: c.text.slice(0, 240),
      page: c.meta?.page,
      heading: c.meta?.heading,
      subject: c.meta?.subject,
      score: c.score || 0
    };
  });

  const confidence = citationConfidence(chunks);

  // Persist session + memory
  appendMsg(session.id, { id: crypto.randomUUID(), role: 'user', content: query, ts: new Date().toISOString() });
  appendMsg(session.id, { id: crypto.randomUUID(), role: 'assistant', content: result.content, citations, ts: new Date().toISOString() });
  logChat(session.id, 'user', query);
  logChat(session.id, 'assistant', result.content);

  // Memory extraction is a second round trip that the student is not waiting
  // for. Cap how long it may delay the reply; if it overruns it still completes
  // in the background and lands in memory for the next turn.
  let memoryNote: string | undefined;
  if (useMemory) {
    const pending = updateMemory(query, result.content);
    memoryNote = await Promise.race([
      pending,
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 2500))
    ]);
    pending.catch(() => undefined);
  }

  return { ...result, citations, confidence, sessionId: session.id, memoryNote };
}

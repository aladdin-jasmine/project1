import { chat } from '../llm/client.js';
import { retrieve } from '../rag/retrieve.js';
import { getDoc } from '../rag/vectorstore.js';
import { getSettings } from '../config/settings.js';
import { getProject } from '../config/projects.js';
import { getMemory, buildMemoryPrompt, recordQuestion, recordConcept, recordMistake } from '../db/memory.js';
import { generateQuiz } from '../study/quiz.js';
import { recommend, type Recommendation } from '../study/recommend.js';
import { planQuestion, type AgentPlan } from './planner.js';
import { parseJSON } from '../study/_shared.js';
import type { Citation } from '../rag/chat.js';
import type { ChatRequest, Collection, DocChunk, Quiz } from '../types.js';
import { logger } from '../util/logger.js';

// ---------------------------------------------------------------------------
// Agentic Orchestrator — the "major innovation" pipeline.
// Instead of one LLM call, a question flows through specialised agents:
//
//   Planner → Retrieval (hybrid) → Reranker → Answer Generator
//           → Quiz Generator → Memory Update → Recommendation
//
// Every agent reports progress through `emit`, so the UI can render a live
// pipeline trace. Each stage is individually fault-tolerant: a failing
// optional agent never aborts the answer.
// ---------------------------------------------------------------------------

export interface AgentRunRequest {
  question: string;
  projectId?: string;
  providerId?: string;
  model?: string;
  docIds?: string[];
  collection?: Collection;
  useMemory?: boolean;
  skipQuiz?: boolean; // force-disable the Quiz Agent
}

export interface AgentStep {
  step: 'planner' | 'retriever' | 'reranker' | 'answer' | 'quiz' | 'memory' | 'recommender';
  status: 'start' | 'end';
  data?: any;
}

export interface AgentRunResult {
  plan: AgentPlan;
  answer: string;
  citations: Citation[];
  confidence: number;
  quiz?: Quiz;
  memoryNote?: string;
  recommendation?: Recommendation;
  providerId?: string;
  model?: string;
}

type Emit = (evt: AgentStep | { token: string }) => void;

function toCitations(chunks: DocChunk[]): Citation[] {
  return chunks.map((c, i) => {
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
}

function citationConfidence(chunks: DocChunk[]): number {
  const top = chunks.slice(0, 3).map((c) => c.score || 0);
  if (!top.length) return 50;
  const avg = top.reduce((a, b) => a + b, 0) / top.length;
  return Math.max(35, Math.min(99, Math.round(avg * 100)));
}

// Memory Agent: extract known/unknown concepts from the turn (best-effort).
async function memoryUpdate(question: string, answer: string, base: ChatRequest): Promise<string | undefined> {
  try {
    recordQuestion(question);
    const out = await chat({
      ...base,
      messages: [
        {
          role: 'system',
          content:
            'From the student question and the assistant answer, identify concepts. Return ONLY JSON: {"known":[..],"unknown":[..],"mistakes":[{"concept":string,"detail":string}]}. Max 4 items each.'
        },
        { role: 'user', content: `Q: ${question}\n\nA: ${answer.slice(0, 1200)}` }
      ],
      maxTokens: 400
    });
    const parsed = parseJSON(out.content);
    (parsed.known || []).forEach((c: string) => recordConcept(c, true));
    (parsed.unknown || []).forEach((c: string) => recordConcept(c, false));
    (parsed.mistakes || []).forEach((x: any) => recordMistake(x.concept, x.detail));
    return 'Memory updated: ' + [...(parsed.known || []), ...(parsed.unknown || [])].slice(0, 4).join(', ');
  } catch {
    return undefined;
  }
}

export async function runAgentPipeline(req: AgentRunRequest, emit: Emit): Promise<AgentRunResult> {
  const base: ChatRequest = { projectId: req.projectId, providerId: req.providerId, model: req.model, messages: [] };
  const project = getProject(req.projectId);
  const useMemory = req.useMemory ?? project?.memoryEnabled ?? true;

  // ---- 1. Planner Agent --------------------------------------------------
  emit({ step: 'planner', status: 'start' });
  const plan = await planQuestion(req.question, base);
  emit({ step: 'planner', status: 'end', data: plan });

  // ---- 2. Retrieval Agent (per planned sub-query, merged + deduped) ------
  emit({ step: 'retriever', status: 'start', data: { queries: plan.retrievalQueries } });
  const merged = new Map<string, DocChunk>();
  for (const q of plan.retrievalQueries) {
    try {
      const chunks = await retrieve(q, 4, { docIds: req.docIds, collection: req.collection });
      for (const c of chunks) {
        const ex = merged.get(c.id);
        if (!ex || (c.score || 0) > (ex.score || 0)) merged.set(c.id, c);
      }
    } catch (err: any) {
      logger.warn(`Retrieval Agent failed for "${q}": ${err?.message}`);
    }
  }
  const ranked = [...merged.values()].sort((a, b) => (b.score || 0) - (a.score || 0));
  emit({
    step: 'retriever',
    status: 'end',
    data: { chunks: ranked.length, sources: [...new Set(ranked.map((c) => getDoc(c.docId)?.name || 'doc'))] }
  });

  // ---- 3. Reranker Agent (retrieve() already fuses BM25+vector w/ RRF; ----
  // cross-encoder runs when enabled — here we finalise the top-k.)
  emit({ step: 'reranker', status: 'start' });
  const settings = getSettings();
  const top = ranked.slice(0, 6);
  emit({
    step: 'reranker',
    status: 'end',
    data: { kept: top.length, strategy: settings.reranker ? 'cross-encoder + RRF' : 'RRF (BM25 + vector)' }
  });

  // ---- 4. Answer Agent ----------------------------------------------------
  emit({ step: 'answer', status: 'start', data: { level: plan.explainLevel } });
  const contextStr = top
    .map((c, i) => {
      const d = getDoc(c.docId);
      const loc = [c.meta?.page ? `p.${c.meta.page}` : '', c.meta?.heading, d?.name].filter(Boolean).join(' · ');
      return `[${i + 1}] (${loc})\n${c.text}`;
    })
    .join('\n\n');
  const memoryBlock = useMemory ? buildMemoryPrompt(getMemory()) : '';
  const levelLine = plan.explainLevel ? `Explain at a "${plan.explainLevel}" level of depth.` : '';
  const visualLine = plan.needsVisual ? 'Include a ```mermaid fenced diagram (flowchart or sequence) that visualises the concept.' : '';

  const sys = `You are the Answer Agent of StudyForge, a multi-agent study system.
Answer using ONLY the retrieved context below. Cite every factual claim with its source marker like [1], [2].
If the context lacks the answer, say so clearly — never invent facts.
${levelLine}
${visualLine}
Be concise, accurate, and pedagogical. Where the student's memory shows prior knowledge, build on it instead of restarting.${memoryBlock}`;

  const answerRes = await chat(
    { ...base, messages: [{ role: 'system', content: `${sys}\n\n--- RETRIEVED CONTEXT ---\n${contextStr}` }, { role: 'user', content: req.question }], maxTokens: 1800 },
    (token) => emit({ token })
  );
  const citations = toCitations(top);
  const confidence = citationConfidence(top);
  emit({ step: 'answer', status: 'end', data: { citations: citations.length, confidence } });

  // ---- 5. Quiz Agent (optional) -------------------------------------------
  let quiz: Quiz | undefined;
  if (plan.needsQuiz && !req.skipQuiz) {
    emit({ step: 'quiz', status: 'start', data: { count: plan.quizCount } });
    try {
      quiz = await generateQuiz(
        { ...base, source: { type: 'text', value: contextStr.slice(0, 6000) } },
        { count: plan.quizCount, difficulty: 'mixed' }
      );
      emit({ step: 'quiz', status: 'end', data: { questions: quiz.questions.length } });
    } catch (err: any) {
      logger.warn(`Quiz Agent failed: ${err?.message}`);
      emit({ step: 'quiz', status: 'end', data: { questions: 0, skipped: true } });
    }
  }

  // ---- 6. Memory Agent ------------------------------------------------------
  let memoryNote: string | undefined;
  if (useMemory) {
    emit({ step: 'memory', status: 'start' });
    memoryNote = await memoryUpdate(req.question, answerRes.content, base);
    emit({ step: 'memory', status: 'end', data: { note: memoryNote } });
  }

  // ---- 7. Recommendation Agent ----------------------------------------------
  let recommendation: Recommendation | undefined;
  emit({ step: 'recommender', status: 'start' });
  try {
    recommendation = await recommend({ ...base, source: { type: 'topic', value: req.question } });
    emit({ step: 'recommender', status: 'end', data: { suggestions: recommendation.suggestions.length } });
  } catch (err: any) {
    logger.warn(`Recommendation Agent failed: ${err?.message}`);
    emit({ step: 'recommender', status: 'end', data: { suggestions: 0, skipped: true } });
  }

  return {
    plan,
    answer: answerRes.content,
    citations,
    confidence,
    quiz,
    memoryNote,
    recommendation,
    providerId: answerRes.providerId,
    model: answerRes.model
  };
}

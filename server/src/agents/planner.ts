import { chatText } from '../llm/client.js';
import { parseJSON } from '../study/_shared.js';
import { getMemory } from '../db/memory.js';
import type { ExplainLevel } from '../types.js';

// ---------------------------------------------------------------------------
// Planner Agent — understands the student's intent and decides which
// specialist agents the orchestrator should invoke, with what queries.
// LLM-driven with a deterministic heuristic fallback (planner must never fail).
// ---------------------------------------------------------------------------

export type AgentIntent = 'explain' | 'quiz' | 'notes' | 'plan' | 'chat';

export interface AgentPlan {
  intent: AgentIntent;
  retrievalQueries: string[]; // sub-queries for the Retrieval Agent
  explainLevel: ExplainLevel | null; // teaching depth, if explanation is needed
  needsQuiz: boolean; // attach a short practice quiz
  quizCount: number;
  needsVisual: boolean; // ask the Answer Agent for a mermaid diagram
  reasoning: string; // one-line rationale (shown in the UI pipeline trace)
}

const LEVELS: ExplainLevel[] = ['Beginner', 'School', 'Engineering', 'Exam', 'Interview'];

function heuristicPlan(question: string): AgentPlan {
  const q = question.toLowerCase();
  const intent: AgentIntent = /quiz|test me|practice|mcq/.test(q)
    ? 'quiz'
    : /notes|summary|revision|marks/.test(q)
      ? 'notes'
      : /study plan|schedule|timetable/.test(q)
        ? 'plan'
        : 'explain';
  const level: ExplainLevel | null = /interview/.test(q)
    ? 'Interview'
    : /exam|marks/.test(q)
      ? 'Exam'
      : /simple|beginner|basic|eli5/.test(q)
        ? 'Beginner'
        : /school/.test(q)
          ? 'School'
          : null;
  return {
    intent,
    retrievalQueries: [question],
    explainLevel: level,
    needsQuiz: intent === 'quiz',
    quizCount: 5,
    needsVisual: /diagram|flow|architecture|process|how does|visual/.test(q),
    reasoning: 'Heuristic plan (LLM planner unavailable)'
  };
}

export async function planQuestion(question: string, req: { projectId?: string; providerId?: string; model?: string }): Promise<AgentPlan> {
  const m = getMemory();
  const memHint = [
    m.known.length ? `Known: ${m.known.slice(0, 12).join(', ')}` : '',
    m.unknown.length ? `Weak: ${m.unknown.slice(0, 12).join(', ')}` : ''
  ]
    .filter(Boolean)
    .join(' | ');

  try {
    const out = await chatText({
      projectId: req.projectId,
      providerId: req.providerId,
      model: req.model,
      messages: [
        {
          role: 'system',
          content:
            'You are the Planner Agent of a multi-agent study system. Analyse the student question and the memory profile, then output a routing plan. Return ONLY JSON.'
        },
        {
          role: 'user',
          content: `Student question: "${question}"
Student memory: ${memHint || 'empty'}

Return JSON:
{
  "intent": "explain"|"quiz"|"notes"|"plan"|"chat",
  "retrievalQueries": string[1-3] (focused search queries; split multi-topic questions),
  "explainLevel": ${JSON.stringify(LEVELS)} | null,
  "needsQuiz": boolean (true if the student should be tested on this),
  "quizCount": number 3-8,
  "needsVisual": boolean (true if a diagram/flowchart would help),
  "reasoning": string (one short line)
}`
        }
      ],
      temperature: 0.2,
      maxTokens: 500
    });
    const p = parseJSON(out);
    const plan: AgentPlan = {
      intent: ['explain', 'quiz', 'notes', 'plan', 'chat'].includes(p?.intent) ? p.intent : 'explain',
      retrievalQueries:
        Array.isArray(p?.retrievalQueries) && p.retrievalQueries.length
          ? p.retrievalQueries.map(String).slice(0, 3)
          : [question],
      explainLevel: LEVELS.includes(p?.explainLevel) ? p.explainLevel : null,
      needsQuiz: Boolean(p?.needsQuiz),
      quizCount: Math.min(8, Math.max(3, Number(p?.quizCount) || 5)),
      needsVisual: Boolean(p?.needsVisual),
      reasoning: String(p?.reasoning || 'LLM plan')
    };
    return plan;
  } catch {
    return heuristicPlan(question);
  }
}

import { chatText } from '../llm/client.js';
import { getMemory } from '../db/memory.js';
import { getProgress } from '../db/progress.js';
import type { GenRequest } from './_shared.js';

export interface Recommendation {
  weakTopics: string[];
  suggestions: { type: 'practice' | 'revision' | 'resource' | 'quiz'; text: string }[];
}

// Personalised learning recommendations from memory + progress analytics.
export async function recommend(req: GenRequest): Promise<Recommendation> {
  const mem = getMemory();
  const prog = getProgress();
  const weak = [
    ...prog.weakTopics.filter((t) => t.weakness > 0.34).map((t) => t.topic),
    ...mem.unknown
  ].filter((v, i, a) => a.indexOf(v) === i).slice(0, 8);

  const known = mem.known.slice(0, 10);
  const mistakes = mem.mistakes.slice(-6);

  const out = await chatText({
    projectId: req.projectId,
    providerId: req.providerId,
    model: req.model,
    messages: [
      {
        role: 'system',
        content:
          'You are a learning advisor. Given the student weak topics, known topics, and recent mistakes, produce 4-6 concrete, personalised suggestions as JSON: {"suggestions":[{"type":"practice"|"revision"|"resource"|"quiz","text":string}]}. Return ONLY valid JSON.'
      },
      {
        role: 'user',
        content: `Weak topics: ${weak.join(', ') || 'none detected'}\nKnown: ${known.join(', ') || 'n/a'}\nRecent mistakes: ${mistakes.map((m) => m.concept).join(', ') || 'none'}\n\nReturn suggestions only.`
      }
    ],
    temperature: 0.5,
    maxTokens: 700
  });
  let t = out.trim();
  const f = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (f) t = f[1].trim();
  const s = t.indexOf('{');
  const e = t.lastIndexOf('}');
  if (s !== -1 && e !== -1) t = t.slice(s, e + 1);
  
  let p: any;
  try {
    p = JSON.parse(t);
  } catch (err) {
    // Return fallback structure
    return {
      weakTopics: weak,
      suggestions: [
        { type: 'practice' as const, text: 'Review weak topics and practice related problems' },
        { type: 'quiz' as const, text: 'Take quizzes on challenging areas' }
      ]
    };
  }
  
  if (!p || typeof p !== 'object') {
    p = {};
  }
  
  const suggestions = Array.isArray(p?.suggestions)
    ? p.suggestions
        .filter((x: any) => x && typeof x === 'object')
        .map((x: any) => ({
          type: (['practice', 'revision', 'resource', 'quiz'].includes(x?.type) ? x.type : 'practice') as any,
          text: String(x?.text || '')
        }))
    : [];
  return { weakTopics: weak, suggestions };
}

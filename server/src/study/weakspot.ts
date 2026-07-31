import { getProgress } from '../db/progress.js';
import { getMemory } from '../db/memory.js';
import { chatText } from '../llm/client.js';
import { parseJSON } from './_shared.js';
import type { GenRequest } from './_shared.js';
import type { WeakSpotReport } from '../types.js';

// Analyse quiz / chat / revision history to surface weak topics.
// Now uses the LLM for personalized, topic-specific guidance instead of templates.
export async function weakSpotReport(req: GenRequest): Promise<WeakSpotReport> {
  const prog = getProgress();
  const mem = getMemory();

  const fromQuiz = prog.weakTopics
    .filter((t) => t.weakness > 0.3)
    .map((t) => ({ topic: t.topic, confidence: Math.max(0.1, 1 - t.weakness), reason: 'Low quiz accuracy' }));
  const fromMem = mem.unknown.map((c) => ({ topic: c, confidence: 0.2, reason: 'Marked as not yet mastered' }));

  const seen = new Set<string>();
  const weakTopics: WeakSpotReport['weakTopics'] = [];
  for (const w of [...fromQuiz, ...fromMem]) {
    if (seen.has(w.topic.toLowerCase())) continue;
    seen.add(w.topic.toLowerCase());
    weakTopics.push(w);
  }
  weakTopics.sort((a, b) => a.confidence - b.confidence);

  // If no weak topics detected, return early with a positive message
  if (weakTopics.length === 0) {
    return {
      weakTopics: [],
      suggestions: [{ topic: 'General', practice: 'Great job! No weak spots detected. Keep practicing to maintain mastery.', revisionPdf: false }]
    };
  }

  // Use the LLM to generate personalized practice guidance
  const topicsList = weakTopics.map(w => `${w.topic} (${w.reason})`).join(', ');
  try {
    const result = await chatText({
      projectId: req.projectId,
      providerId: req.providerId,
      model: req.model,
      messages: [
        {
          role: 'system',
          content: `You are an expert study coach. Given a student's weak topics, generate personalized practice guidance for each.
For each topic, provide a specific, actionable practice recommendation that targets the student's weakness.
Return ONLY valid JSON: {"suggestions":[{"topic":string,"practice":string}]}`
        },
        {
          role: 'user',
          content: `The student is weak in these topics: ${topicsList}. Generate specific practice guidance for each topic.`
        }
      ],
      temperature: 0.3,
      maxTokens: 1200
    });
    const parsed = parseJSON(result);
    if (parsed?.suggestions && Array.isArray(parsed.suggestions)) {
      return {
        weakTopics,
        suggestions: parsed.suggestions.map((s: any) => ({
          topic: String(s.topic || ''),
          practice: String(s.practice || ''),
          revisionPdf: true
        }))
      };
    }
  } catch {
    // Fallback to template if LLM fails
  }

  // Fallback: template-based suggestions
  const suggestions = weakTopics.slice(0, 8).map((w) => ({
    topic: w.topic,
    practice: `Solve 5 targeted practice questions on "${w.topic}" and review its chapter.`,
    revisionPdf: true
  }));

  return { weakTopics, suggestions };
}

// Plain-text revision sheet for the weak topics (used by the PDF export).
export function revisionContent(topics: string[]): string {
  const lines: string[] = ['STUDYFORGE — WEAK-TOPIC REVISION SHEET', ''];
  topics.forEach((t, i) => {
    lines.push(`${i + 1}. ${t.toUpperCase()}`);
    lines.push('   - Review key definitions and formulas');
    lines.push('   - Solve 3–5 practice problems');
    lines.push('   - Re-read the relevant chapter and summarise in your own words');
    lines.push('');
  });
  return lines.join('\n');
}

import { getAdvancedAnalytics } from './analytics-advanced.js';
import { listDocs } from '../rag/vectorstore.js';
import type { LearningAnalytics } from '../types.js';

// Compute the AI learning dashboard metrics.
// Delegates to getAdvancedAnalytics() for real data-driven insights.
export async function computeAnalytics(): Promise<LearningAnalytics> {
  return getAdvancedAnalytics();
}

export function subjectsList(): string[] {
  const docs = listDocs();
  const set = new Set<string>();
  for (const d of docs) if (d.subject) set.add(d.subject);
  return [...set];
}

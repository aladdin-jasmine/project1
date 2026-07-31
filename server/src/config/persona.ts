import type { ExplainLevel, LearningStyle } from '../types.js';

export const EXPLAIN_LEVELS: { key: ExplainLevel; label: string; prompt: string }[] = [
  { key: 'Beginner', label: 'Beginner', prompt: 'Explain for a complete beginner with zero background — use everyday analogies and the simplest possible language.' },
  { key: 'School', label: 'School Student', prompt: 'Explain for a school student — clear, syllabus-friendly, with a simple example.' },
  { key: 'Engineering', label: 'Engineering Student', prompt: 'Explain for an engineering undergraduate — rigorous, with formal definitions and a worked example.' },
  { key: 'Exam', label: 'Exam Mode', prompt: 'Explain for last-minute exam prep — high-yield, concise, emphasise what to memorise and common traps.' },
  { key: 'Interview', label: 'Interview Mode', prompt: 'Explain for a technical interview — precise, cover edge cases, trade-offs, and a strong example.' }
];

export const LEARNING_STYLES: { key: LearningStyle; label: string }[] = [
  { key: 'visual', label: 'Visual' },
  { key: 'auditory', label: 'Auditory' },
  { key: 'reading', label: 'Reading/Writing' },
  { key: 'kinesthetic', label: 'Kinesthetic' },
  { key: 'balanced', label: 'Balanced' }
];

export function levelPrompt(level: ExplainLevel): string {
  return EXPLAIN_LEVELS.find((l) => l.key === level)?.prompt || '';
}

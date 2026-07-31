import { getContext, generateJSON, type GenRequest } from './_shared.js';
import { getMemory } from '../db/memory.js';
import type { Quiz, QuizQuestion } from '../types.js';

export type QuizType = 'mcq' | 'fill' | 'short' | 'long' | 'coding';
export type Difficulty = 'easy' | 'medium' | 'hard';

// Adaptive mode: derive the target difficulty from the student's quiz history.
// <60% accuracy → easy, 60–85% → medium, >85% → hard. No history → medium.
export function adaptiveDifficulty(): Difficulty {
  const m = getMemory();
  let correct = 0;
  let total = 0;
  for (const v of Object.values(m.topicScores || {})) {
    correct += v.correct;
    total += v.correct + v.incorrect;
  }
  if (total < 3) return 'medium';
  const acc = correct / total;
  return acc < 0.6 ? 'easy' : acc > 0.85 ? 'hard' : 'medium';
}

const TYPE_INSTR =
  'ONLY generate "mcq" questions. Every question must have exactly 4 options and one correct answer (answerIndex). Do NOT generate fill-in-the-blank, short answer, long answer, or coding questions.';

const SCHEMA = `{
  "title": string,
  "questions": [
    {
      "question": string,
      "type": "mcq",
      "options": string[4],
      "answerIndex": number,
      "explanation": string,
      "difficulty": "easy"|"medium"|"hard",
      "topic": string
    }
  ]
}`;

function normalize(q: any, count: number): Quiz {
  if (!q || typeof q !== 'object') {
    return { title: 'Quiz', questions: [] };
  }

  const questions: QuizQuestion[] = Array.isArray(q?.questions)
    ? q.questions.slice(0, count).map((x: any) => {
        if (!x || typeof x !== 'object') {
          return {
            question: 'Invalid question',
            type: 'mcq' as QuizType,
            options: ['A', 'B', 'C', 'D'],
            answerIndex: 0,
            answer: undefined,
            explanation: '',
            difficulty: 'medium' as const,
            topic: undefined
          };
        }

        const opts = Array.isArray(x?.options) ? x.options.map(String) : [];
        let ans = Number(x?.answerIndex);
        if (!Number.isInteger(ans) || ans < 0 || ans >= opts.length) ans = 0;

        return {
          question: String(x?.question || 'Question'),
          type: 'mcq' as QuizType,
          options: [
            opts[0] || 'Option A',
            opts[1] || 'Option B',
            opts[2] || 'Option C',
            opts[3] || 'Option D'
          ],
          answerIndex: ans,
          answer: undefined,
          explanation: String(x?.explanation || ''),
          difficulty: ['easy', 'medium', 'hard'].includes(x?.difficulty) ? x.difficulty : 'medium',
          topic: x?.topic ? String(x.topic) : undefined
        };
      })
    : [];
  return { title: String(q?.title || 'Quiz'), questions };
}

export async function generateQuiz(
  req: GenRequest,
  opts: { count?: number; types?: QuizType[]; difficulty?: Difficulty | 'mixed' | 'adaptive' } = {}
): Promise<Quiz> {
  const ctx = await getContext(req.source);
  const count = opts.count || 8;
  const typeHint = opts.types && opts.types.length ? `Use ONLY these types: ${opts.types.join(', ')}.` : TYPE_INSTR;
  let diffHint = 'Vary the difficulty across easy/medium/hard.';
  if (opts.difficulty === 'adaptive') {
    const target = adaptiveDifficulty();
    diffHint = `ADAPTIVE MODE: the student's recent quiz accuracy suggests "${target}" difficulty. Aim most questions at "${target}", with one step easier and one step harder for calibration.`;
  } else if (opts.difficulty && opts.difficulty !== 'mixed') {
    diffHint = `All questions should be "${opts.difficulty}" difficulty.`;
  }
  const quiz = await generateJSON(
    `You are a test author. Write questions that check understanding, not memorization. ONLY MCQ with exactly 4 options. ${typeHint} ${diffHint} Distractors must be plausible.`,
    `Create a ${count}-question quiz from this material:\n\n${ctx}`,
    req,
    SCHEMA
  );
  return normalize(quiz, count);
}

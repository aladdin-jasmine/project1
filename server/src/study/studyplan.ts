import { generateJSON, getContext, type GenRequest } from './_shared.js';
import type { StudyPlan, StudyDay } from '../types.js';

const SCHEMA = `{
  "goal": string,
  "durationDays": number,
  "summary": string,
  "days": [
    { "day": number, "date": string, "topics": string[], "tasks": string[], "estMinutes": number, "priority": string[] }
  ]
}`;

export interface PlanOptions {
  goal?: string;
  durationDays?: number;
  examDate?: string;
  hoursPerDay?: number;
  subjects?: string[];
}

export async function generateStudyPlan(req: GenRequest, opts: PlanOptions = {}): Promise<StudyPlan> {
  const ctx = await getContext(req.source);
  const durationDays = opts.durationDays || 7;
  const goal = opts.goal || 'Master this topic';
  const bits: string[] = [];
  if (opts.examDate) bits.push(`Exam date: ${opts.examDate}.`);
  if (opts.hoursPerDay) bits.push(`Available study time: ${opts.hoursPerDay} hours/day.`);
  if (opts.subjects?.length) bits.push(`Subjects to cover: ${opts.subjects.join(', ')}.`);
  const extra = bits.length ? `\nConstraints:\n${bits.join('\n')}` : '';

  const plan = await generateJSON(
    `You are a study coach. Create a realistic, motivating study plan that distributes topics across days with concrete tasks, time estimates, and priority chapters. Adapt difficulty over time.`,
    `Goal: "${goal}". Spread learning across ${durationDays} days.${extra}\nUse this material as the knowledge base:\n\n${ctx}`,
    req,
    SCHEMA
  );
  const days: StudyDay[] = Array.isArray(plan?.days)
    ? plan.days.slice(0, durationDays).map((d: any, i: number) => ({
        day: Number(d?.day) || i + 1,
        date: d?.date ? String(d.date) : undefined,
        topics: Array.isArray(d?.topics) ? d.topics.map(String) : [],
        tasks: Array.isArray(d?.tasks) ? d.tasks.map(String) : [],
        estMinutes: Number(d?.estMinutes) || 30,
        priority: Array.isArray(d?.priority) ? d.priority.map(String) : undefined
      }))
    : [];
  return {
    goal: String(plan?.goal || goal),
    durationDays: Number(plan?.durationDays) || durationDays,
    summary: String(plan?.summary || ''),
    examDate: opts.examDate,
    subjects: opts.subjects,
    hoursPerDay: opts.hoursPerDay,
    days
  };
}

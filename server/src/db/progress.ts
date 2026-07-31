import { readJson, writeJson } from './store.js';
import { logActivity } from './postgres.js';

interface WeakTopic {
  correct: number;
  incorrect: number;
}
interface Progress {
  xp: number;
  streak: { lastDate: string; count: number };
  weakTopics: Record<string, WeakTopic>;
  totals: { slides: number; flashcards: number; quizzes: number; chats: number; mindmaps: number; plans: number; notes: number; voice: number };
  studyTimeMin: number;
  quizHistory: { date: string; score: number }[];
  activityHistory: { date: string; type: string }[];
  knowledgeHistory: { date: string; score: number }[];
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function yesterday(): string {
  const d = new Date(Date.now() - 86400000);
  return d.toISOString().slice(0, 10);
}

function defaultProgress(): Progress {
  return {
    xp: 0,
    streak: { lastDate: '', count: 0 },
    weakTopics: {},
    totals: { slides: 0, flashcards: 0, quizzes: 0, chats: 0, mindmaps: 0, plans: 0, notes: 0, voice: 0 },
    studyTimeMin: 0,
    quizHistory: [],
    activityHistory: [],
    knowledgeHistory: []
  };
}

// Merge with defaults so older/partial data files never crash consumers.
function load(): Progress {
  const p = readJson<Progress>('progress', defaultProgress());
  const d = defaultProgress();
  return {
    ...d,
    ...p,
    streak: { ...d.streak, ...(p.streak || {}) },
    weakTopics: p.weakTopics || {},
    totals: { ...d.totals, ...(p.totals || {}) },
    quizHistory: p.quizHistory || [],
    activityHistory: p.activityHistory || [],
    knowledgeHistory: p.knowledgeHistory || []
  };
}
function save(p: Progress) {
  writeJson('progress', p);
}

const XP: Record<string, number> = {
  slides: 15,
  flashcards: 10,
  quiz: 20,
  chats: 5,
  mindmap: 12,
  plan: 18,
  explain: 8,
  summarize: 8,
  notes: 14,
  eval: 12,
  voice: 6
};

export type ActivityType = keyof typeof XP;

export function addActivity(type: ActivityType, topicCorrect?: number, topicIncorrect?: number, topic?: string) {
  const p = load();
  p.xp += XP[type] || 5;
  p.totals[type] = (p.totals[type] || 0) + 1;

  if (p.streak.lastDate !== today()) {
    p.streak.count = p.streak.lastDate === yesterday() ? p.streak.count + 1 : 1;
    p.streak.lastDate = today();
  }

  if (topic && (topicCorrect !== undefined || topicIncorrect !== undefined)) {
    const t = p.weakTopics[topic] || { correct: 0, incorrect: 0 };
    t.correct += topicCorrect || 0;
    t.incorrect += topicIncorrect || 0;
    p.weakTopics[topic] = t;
  }

  p.activityHistory.push({ date: today(), type });
  if (p.activityHistory.length > 600) p.activityHistory = p.activityHistory.slice(-600);

  save(p);
  logActivity(type, topic, topicCorrect, topicIncorrect);
  return getProgress();
}

export function addStudyTime(minutes: number) {
  const p = load();
  p.studyTimeMin += Math.max(0, minutes);
  save(p);
  return getProgress();
}

export function recordQuiz(score01: number) {
  const p = load();
  p.quizHistory.push({ date: today(), score: Math.max(0, Math.min(1, score01)) });
  if (p.quizHistory.length > 300) p.quizHistory = p.quizHistory.slice(-300);
  save(p);
}

export function recordKnowledge(score01: number) {
  const p = load();
  p.knowledgeHistory.push({ date: today(), score: Math.max(0, Math.min(1, score01)) });
  if (p.knowledgeHistory.length > 300) p.knowledgeHistory = p.knowledgeHistory.slice(-300);
  save(p);
}

export function getProgress() {
  const p = load();
  const topics = Object.entries(p.weakTopics).map(([topic, v]) => ({
    topic,
    correct: v.correct,
    incorrect: v.incorrect,
    weakness: v.correct + v.incorrect > 0 ? v.incorrect / (v.correct + v.incorrect) : 0
  }));
  topics.sort((a, b) => b.weakness - a.weakness);
  const totalCorrect = topics.reduce((s, t) => s + t.correct, 0);
  const totalIncorrect = topics.reduce((s, t) => s + t.incorrect, 0);
  const mastery = totalCorrect + totalIncorrect > 0 ? totalCorrect / (totalCorrect + totalIncorrect) : 0;

  // weekly activity (last 7 days)
  const weeklyActivity: { date: string; actions: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    weeklyActivity.push({ date: d, actions: p.activityHistory.filter((a) => a.date === d).length });
  }

  return {
    xp: p.xp,
    streak: p.streak.count,
    mastery,
    totals: p.totals,
    studyTimeMin: p.studyTimeMin,
    studyHours: Math.round((p.studyTimeMin / 60) * 10) / 10,
    quizHistory: p.quizHistory,
    knowledgeHistory: p.knowledgeHistory,
    weakTopics: topics,
    weeklyActivity
  };
}

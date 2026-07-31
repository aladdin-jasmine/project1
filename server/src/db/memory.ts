import { readJson, writeJson } from './store.js';
import type { MemoryState } from '../types.js';

const FILE = 'memory';

function empty(): MemoryState {
  return {
    known: [],
    unknown: [],
    mistakes: [],
    topicScores: {},
    viewedChunks: {},
    questionsAsked: [],
    lastUpdate: new Date().toISOString(),
    // New fields
    learningVelocity: {},
    studySessions: [],
    retentionScores: {},
    cognitiveLoad: {},
    preferredLearningTimes: [],
    streakDays: 0,
    totalStudyMinutes: 0,
    conceptMastery: {}
  };
}

export function getMemory(): MemoryState {
  return load();
}

export function saveMemory(m: MemoryState): void {
  m.lastUpdate = new Date().toISOString();
  writeJson(FILE, m);
}

// Merge with defaults so older/partial data files (missing fields) never crash consumers.
function load(): MemoryState {
  const m = readJson<MemoryState>(FILE, empty());
  return {
    known: m.known || [],
    unknown: m.unknown || [],
    mistakes: m.mistakes || [],
    topicScores: m.topicScores || {},
    viewedChunks: m.viewedChunks || {},
    questionsAsked: m.questionsAsked || [],
    lastUpdate: m.lastUpdate || new Date().toISOString(),
    learningVelocity: m.learningVelocity || {},
    studySessions: m.studySessions || [],
    retentionScores: m.retentionScores || {},
    cognitiveLoad: m.cognitiveLoad || {},
    preferredLearningTimes: m.preferredLearningTimes || [],
    streakDays: m.streakDays || 0,
    totalStudyMinutes: m.totalStudyMinutes || 0,
    conceptMastery: m.conceptMastery || {}
  };
}
function persist(m: MemoryState) {
  saveMemory(m);
}

// Record that the student understands / is weak on a concept.
export function recordConcept(concept: string, known: boolean): void {
  const m = load();
  const c = concept.trim();
  if (!c) return;
  const set = known ? m.known : m.unknown;
  if (!set.find((x) => x.toLowerCase() === c.toLowerCase())) set.push(c);
  // Remove from the opposite set to avoid contradiction.
  const opp = known ? m.unknown : m.known;
  const i = opp.findIndex((x) => x.toLowerCase() === c.toLowerCase());
  if (i >= 0) opp.splice(i, 1);
  persist(m);
}

export function recordMistake(concept: string, detail: string): void {
  const m = load();
  m.mistakes.push({ concept: concept.trim(), detail, ts: new Date().toISOString() });
  if (m.mistakes.length > 200) m.mistakes = m.mistakes.slice(-200);
  persist(m);
}

export function recordTopicScore(topic: string, correct: number, incorrect: number): void {
  const m = load();
  const t = m.topicScores[topic] || { correct: 0, incorrect: 0, lastAttempt: '', confidence: 0 };
  t.correct += correct;
  t.incorrect += incorrect;
  t.lastAttempt = new Date().toISOString();
  t.confidence = t.correct + t.incorrect > 0 ? t.correct / (t.correct + t.incorrect) : 0;
  m.topicScores[topic] = t;
  
  // Update concept mastery based on quiz performance
  const masteryLevel = Math.min(100, Math.round(t.confidence * 100));
  if (!m.conceptMastery[topic]) {
    m.conceptMastery[topic] = { level: 0, evidence: [], lastUpdate: '' };
  }
  m.conceptMastery[topic].level = masteryLevel;
  m.conceptMastery[topic].evidence.push(`Quiz: ${correct}/${correct + incorrect} correct`);
  m.conceptMastery[topic].lastUpdate = new Date().toISOString();
  
  persist(m);
}

export function recordView(chunkId: string): void {
  const m = load();
  m.viewedChunks[chunkId] = (m.viewedChunks[chunkId] || 0) + 1;
  persist(m);
}

export function recordQuestion(q: string): void {
  const m = load();
  m.questionsAsked.push(q);
  if (m.questionsAsked.length > 300) m.questionsAsked = m.questionsAsked.slice(-300);
  persist(m);
}

// Build a compact memory block for injection into the system prompt so the
// assistant can skip what the student already knows and target weak areas.
export function buildMemoryPrompt(m: MemoryState, term?: string): string {
  const parts: string[] = [];
  if (m.known.length) {
    parts.push(`Student already understands: ${m.known.slice(0, 25).join(', ')}.`);
  }
  if (m.unknown.length) {
    parts.push(`Student is weak on / has not mastered: ${m.unknown.slice(0, 25).join(', ')}.`);
  }
  const weak = Object.entries(m.topicScores)
    .filter(([, v]) => v.correct + v.incorrect > 0 && v.incorrect / (v.correct + v.incorrect) >= 0.34)
    .map(([t]) => t);
  if (weak.length) parts.push(`Topics with low quiz confidence: ${weak.slice(0, 15).join(', ')}.`);
  if (term) {
    const k = m.known.find((x) => x.toLowerCase() === term.toLowerCase());
    const u = m.unknown.find((x) => x.toLowerCase() === term.toLowerCase());
    if (k) parts.push(`The student already knows "${term}" — build on it, don't re-explain from scratch.`);
    if (u) parts.push(`The student struggles with "${term}" — explain it carefully with extra examples.`);
  }
  if (!parts.length) return '';
  return `\n\n--- STUDENT MEMORY (personalised) ---\n${parts.join('\n')}\nWhen answering, leverage what they know and proactively reinforce weak areas.`;
}

// ---- Advanced Memory Tracking Functions ----

export function startStudySession(): string {
  const m = load();
  const sessionId = Date.now().toString();
  m.studySessions.push({
    start: new Date().toISOString(),
    end: '',
    topics: [],
    effectiveness: 0
  });
  
  // Update streak
  const lastSession = m.studySessions[m.studySessions.length - 2];
  if (lastSession) {
    const lastDate = new Date(lastSession.start).toDateString();
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    
    if (lastDate === yesterday) {
      m.streakDays += 1;
    } else if (lastDate !== today) {
      m.streakDays = 1;
    }
  } else {
    m.streakDays = 1;
  }
  
  persist(m);
  return sessionId;
}

export function endStudySession(topics: string[], effectiveness: number): void {
  const m = load();
  const lastSession = m.studySessions[m.studySessions.length - 1];
  if (lastSession && !lastSession.end) {
    lastSession.end = new Date().toISOString();
    lastSession.topics = topics;
    lastSession.effectiveness = effectiveness;
    
    const duration = new Date(lastSession.end).getTime() - new Date(lastSession.start).getTime();
    m.totalStudyMinutes += Math.round(duration / 60000);
    
    // Calculate learning velocity
    topics.forEach(topic => {
      const hours = duration / 3600000;
      const conceptsLearned = (m.topicScores[topic]?.correct || 0);
      m.learningVelocity[topic] = conceptsLearned / Math.max(hours, 0.1);
    });
    
    // Track preferred learning times
    const hour = new Date(lastSession.start).getHours();
    const existing = m.preferredLearningTimes.find(t => t.hour === hour);
    if (existing) {
      existing.effectiveness = (existing.effectiveness * 0.7 + effectiveness * 0.3);
    } else {
      m.preferredLearningTimes.push({ hour, effectiveness });
    }
  }
  persist(m);
}

export function updateCognitiveLoad(topic: string, difficulty: number): void {
  const m = load();
  m.cognitiveLoad[topic] = difficulty;
  persist(m);
}

export function updateRetentionScore(concept: string, remembered: boolean): void {
  const m = load();
  const existing = m.retentionScores[concept];
  const now = new Date();
  
  if (!existing) {
    m.retentionScores[concept] = {
      score: remembered ? 1.0 : 0.5,
      lastReview: now.toISOString(),
      nextReview: new Date(now.getTime() + (remembered ? 7 : 1) * 86400000).toISOString()
    };
  } else {
    existing.score = remembered ? Math.min(1.0, existing.score * 1.2) : Math.max(0.3, existing.score * 0.7);
    existing.lastReview = now.toISOString();
    const interval = remembered ? Math.round(7 * existing.score) : 1;
    existing.nextReview = new Date(now.getTime() + interval * 86400000).toISOString();
  }
  
  persist(m);
}

export function recordConceptMastery(concept: string, level: number, evidence: string): void {
  const m = load();
  if (!m.conceptMastery[concept]) {
    m.conceptMastery[concept] = { level: 0, evidence: [], lastUpdate: '' };
  }
  m.conceptMastery[concept].level = level;
  m.conceptMastery[concept].evidence.push(evidence);
  m.conceptMastery[concept].lastUpdate = new Date().toISOString();
  
  // Keep only last 10 evidence items
  if (m.conceptMastery[concept].evidence.length > 10) {
    m.conceptMastery[concept].evidence = m.conceptMastery[concept].evidence.slice(-10);
  }
  
  persist(m);
}

export function getLearningVelocity(topic: string): number {
  const m = load();
  return m.learningVelocity[topic] || 0;
}

export function getOptimalStudyTime(): { hour: number; effectiveness: number } | null {
  const m = load();
  if (!m.preferredLearningTimes.length) return null;
  return m.preferredLearningTimes.reduce((best, current) => 
    current.effectiveness > best.effectiveness ? current : best
  );
}

export function getStreakDays(): number {
  const m = load();
  return m.streakDays;
}

export function getTotalStudyHours(): number {
  const m = load();
  return m.totalStudyMinutes / 60;
}

export function getBurnoutRisk(): number {
  const m = load();
  const recentSessions = m.studySessions.slice(-14); // last 2 weeks
  if (recentSessions.length < 3) return 0;
  
  const avgEffectiveness = recentSessions.reduce((sum, s) => sum + s.effectiveness, 0) / recentSessions.length;
  const sessionsPerDay = recentSessions.length / 14;
  
  let risk = 0;
  if (avgEffectiveness < 0.5) risk += 30;
  if (sessionsPerDay > 3) risk += 25;
  if (m.totalStudyMinutes > 2000) risk += 20; // > 33 hours total without break
  
  const recentMistakes = m.mistakes.filter(m => {
    const age = Date.now() - new Date(m.ts).getTime();
    return age < 7 * 86400000; // last 7 days
  });
  if (recentMistakes.length > 20) risk += 25;
  
  return Math.min(100, risk);
}

export function getConceptMasteryLevel(concept: string): number {
  const m = load();
  return m.conceptMastery[concept]?.level || 0;
}

export function getWeakConcepts(threshold = 50): string[] {
  const m = load();
  return Object.entries(m.conceptMastery)
    .filter(([_, data]) => data.level < threshold)
    .map(([concept, _]) => concept);
}

export function getStrongConcepts(threshold = 80): string[] {
  const m = load();
  return Object.entries(m.conceptMastery)
    .filter(([_, data]) => data.level >= threshold)
    .map(([concept, _]) => concept);
}

export function getConceptsDueForReview(): string[] {
  const m = load();
  const now = Date.now();
  return Object.entries(m.retentionScores)
    .filter(([_, data]) => new Date(data.nextReview).getTime() <= now)
    .map(([concept, _]) => concept);
}

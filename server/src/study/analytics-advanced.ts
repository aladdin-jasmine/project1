import { chatText } from '../llm/client.js';
import { getProgress } from '../db/progress.js';
import { getMemory, getConceptMasteryLevel, getBurnoutRisk, getLearningVelocity, getOptimalStudyTime, getWeakConcepts, getStrongConcepts } from '../db/memory.js';
import { listDocs } from '../rag/vectorstore.js';
import type { GenRequest } from './_shared.js';
import type { LearningAnalytics } from '../types.js';

// ---------------------------------------------------------------------------
// Advanced Learning Analytics — predictive, actionable insights
// Tracks not just what the student does, but predicts outcomes and suggests
// personalized interventions. Faculty love measurable analytics.
// ---------------------------------------------------------------------------

const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));

export async function getAdvancedAnalytics(req?: GenRequest): Promise<LearningAnalytics> {
  const p = getProgress();
  const m = getMemory();
  const docs = listDocs();
  const now = Date.now();

  // Basic scores from existing system
  const knowledgeScore = p.mastery;
  const avgQuizScore = p.quizHistory.length
    ? p.quizHistory.reduce((s, q) => s + q.score, 0) / p.quizHistory.length
    : p.totals.quizzes
      ? p.mastery
      : 0;

  const actions = p.weeklyActivity.map((a) => a.actions);
  const activeDays = actions.filter((a) => a > 0).length;
  const consistencyScore = Math.round((activeDays / 7) * 100);

  const revisionActivity = p.totals.flashcards + p.totals.plans * 2 + m.mistakes.length;
  const revisionScore = Math.round(clamp(revisionActivity / Math.max(1, p.totals.quizzes * 2 + 1)) * 100);

  const completionPct = Math.round(clamp((p.totals.slides + p.totals.flashcards + p.totals.quizzes + p.totals.mindmaps) / 20) * 100);

  const studyHours = p.studyHours;
  const chatUsage = p.totals.chats || 0;

  // Enhanced weak topics with predictions
  const weakTopics = p.weakTopics.map((t) => {
    const cogLoad = m.cognitiveLoad[t.topic] || 0.5;
    const velocity = getLearningVelocity(t.topic) || 0.1;
    const masteryLevel = getConceptMasteryLevel(t.topic);
    const estimatedHours = Math.round((100 - masteryLevel) / 10 / Math.max(velocity, 0.1));
    
    return {
      topic: t.topic,
      weakness: t.weakness,
      predictedDifficulty: Math.round(cogLoad * 100),
      estimatedHours
    };
  });

  // Strong topics with mastery levels
  const strongConcepts = getStrongConcepts(75);
  const strongTopics = strongConcepts.slice(0, 20).map((topic) => ({
    topic,
    masteryLevel: getConceptMasteryLevel(topic)
  }));

  // Weekly activity with effectiveness
  const weeklyActivity = p.weeklyActivity.map((w) => ({
    date: w.date,
    actions: w.actions,
    effectiveness: calculateEffectiveness(w.date, m)
  }));

  // Knowledge growth with velocity
  const knowledgeGrowth = p.knowledgeHistory.map((k, i, arr) => ({
    date: k.date,
    score: k.score,
    velocity: i > 0 ? k.score - arr[i - 1].score : 0
  }));

  // Advanced metrics
  const totalConcepts = Object.keys(m.conceptMastery).length || 1;
  const masteredCount = Object.values(m.conceptMastery).filter((c) => c.level >= 80).length;
  const learningEfficiency = studyHours > 0 ? masteredCount / studyHours : 0;

  // Retention rate (concepts still remembered after 7 days)
  const oldRetentions = Object.entries(m.retentionScores).filter(([_, r]) => {
    const daysSinceReview = (now - new Date(r.lastReview).getTime()) / 86400000;
    return daysSinceReview >= 7;
  });
  const retainedCount = oldRetentions.filter(([_, r]) => r.score >= 0.7).length;
  const retentionRate = oldRetentions.length > 0 ? Math.round((retainedCount / oldRetentions.length) * 100) : 100;

  // Prediction accuracy placeholder (would track actual vs predicted difficulty)
  const predictionAccuracy = null;

  // Optimal study time
  const optimalTime = getOptimalStudyTime();
  const optimalStudyTime = optimalTime ? { hour: optimalTime.hour, day: 'weekday' } : null;

  // Burnout risk
  const burnoutRisk = getBurnoutRisk();

  // Readiness scores per topic
  const readinessScore: Record<string, number> = {};
  Object.entries(m.topicScores).forEach(([topic, t]) => {
    const masteryLevel = getConceptMasteryLevel(topic);
    const retention = m.retentionScores[topic]?.score || 0.5;
    const readiness = Math.round(masteryLevel * 0.6 + retention * 40);
    readinessScore[topic] = readiness;
  });

  // Concept connections (knowledge graph)
  const conceptConnections = extractConceptConnections(m);

  // Struggling concepts
  const strugglingConcepts = Object.entries(m.topicScores)
    .filter(([_, t]) => t.correct + t.incorrect >= 3)
    .map(([concept, t]) => ({
      concept,
      attempts: t.correct + t.incorrect,
      successRate: t.confidence || 0
    }))
    .filter((c) => c.successRate < 0.5)
    .sort((a, b) => a.successRate - b.successRate)
    .slice(0, 10);

  // Mastered concepts
  const masteredConcepts = Object.entries(m.conceptMastery)
    .filter(([_, c]) => c.level >= 80)
    .map(([concept, c]) => ({
      concept,
      level: c.level,
      lastReviewed: c.lastUpdate
    }))
    .sort((a, b) => b.level - a.level)
    .slice(0, 20);

  return {
    knowledgeScore,
    consistencyScore,
    revisionScore,
    avgQuizScore,
    completionPct,
    studyHours: Math.round(studyHours * 10) / 10,
    chatUsage,
    weakTopics,
    strongTopics,
    weeklyActivity,
    knowledgeGrowth,
    learningEfficiency: Math.round(learningEfficiency * 100) / 100,
    retentionRate,
    predictionAccuracy,
    optimalStudyTime,
    burnoutRisk,
    readinessScore,
    conceptConnections,
    strugglingConcepts,
    masteredConcepts
  };
}

function calculateEffectiveness(date: string, m: any): number {
  const daySessions = m.studySessions.filter((s: any) => s.start.startsWith(date));
  if (daySessions.length === 0) return 0;
  return daySessions.reduce((sum: number, s: any) => sum + (s.effectiveness || 0.5), 0) / daySessions.length;
}

function extractConceptConnections(m: any): { from: string; to: string; strength: number }[] {
  const connections: { from: string; to: string; strength: number }[] = [];
  const concepts = [...m.known, ...m.unknown].slice(0, 40);
  
  // Co-occurrence based connections from questions
  const cooccurrence: Record<string, Record<string, number>> = {};
  m.questionsAsked.slice(-100).forEach((q: string) => {
    const mentioned = concepts.filter((c) => q.toLowerCase().includes(c.toLowerCase()));
    for (let i = 0; i < mentioned.length; i++) {
      for (let j = i + 1; j < mentioned.length; j++) {
        const key = mentioned[i];
        if (!cooccurrence[key]) cooccurrence[key] = {};
        cooccurrence[key][mentioned[j]] = (cooccurrence[key][mentioned[j]] || 0) + 1;
      }
    }
  });

  Object.entries(cooccurrence).forEach(([from, targets]) => {
    Object.entries(targets).forEach(([to, count]) => {
      connections.push({ from, to, strength: Math.min(1, count / 5) });
    });
  });

  return connections.slice(0, 100);
}

export function subjectsList(): string[] {
  const docs = listDocs();
  const set = new Set<string>();
  for (const d of docs) if (d.subject) set.add(d.subject);
  return [...set];
}

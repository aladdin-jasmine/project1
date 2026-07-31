import { chatText } from '../llm/client.js';
import { getMemory, getLearningVelocity, getConceptMasteryLevel } from '../db/memory.js';
import { parseJSON } from './_shared.js';
import type { GenRequest } from './_shared.js';

const SCHEMA = `{
  "nextTopic": string,
  "rationale": string,
  "plan": string[],
  "difficulty": number (1-10),
  "estimatedHours": number,
  "prerequisites": string[],
  "recommendedOrder": string[]
}`;

export interface PredictInput {
  syllabus: string[];
  examDate?: string;
  pastScores?: Record<string, number>; // topic -> 0..1
  hoursPerDay?: number;
  targetScore?: number;
}

export interface PredictionResult {
  nextTopic: string;
  rationale: string;
  plan: string[];
  difficulty: number;
  estimatedHours: number;
  prerequisites: string[];
  recommendedOrder: string[];
}

// Advanced prediction engine that considers:
// 1. Student's past performance and learning velocity
// 2. Time remaining until exam
// 3. Topic dependencies and difficulty
// 4. Cognitive load and retention patterns
// 5. Spaced repetition scheduling
export async function predictNext(input: PredictInput, req: GenRequest): Promise<PredictionResult> {
  const m = getMemory();
  const syllabusStr = input.syllabus.join(', ');
  
  // Calculate study time available
  const daysUntilExam = input.examDate 
    ? Math.max(1, Math.round((new Date(input.examDate).getTime() - Date.now()) / 86400000))
    : 30;
  const totalHoursAvailable = daysUntilExam * (input.hoursPerDay || 3);
  
  // Build performance context
  const scoresStr = input.pastScores
    ? Object.entries(input.pastScores)
        .map(([k, v]) => `${k}: ${Math.round(v * 100)}%`)
        .join(', ')
    : 'no quiz data yet';
  
  // Calculate learning velocities
  const velocities = input.syllabus.map(topic => ({
    topic,
    velocity: getLearningVelocity(topic) || 0.5,
    mastery: getConceptMasteryLevel(topic),
    attempts: m.topicScores[topic] ? m.topicScores[topic].correct + m.topicScores[topic].incorrect : 0
  }));
  
  const velocityStr = velocities
    .filter(v => v.attempts > 0)
    .map(v => `${v.topic}: ${v.mastery}% mastered, ${v.velocity.toFixed(1)} concepts/hr`)
    .join('; ');
  
  // Get weak concepts that need review
  const weakConcepts = Object.entries(m.conceptMastery)
    .filter(([topic, data]) => input.syllabus.includes(topic) && data.level < 70)
    .map(([topic, data]) => `${topic} (${data.level}%)`);
  
  // Get concepts due for spaced repetition
  const dueForReview = Object.entries(m.retentionScores)
    .filter(([topic, data]) => {
      return input.syllabus.includes(topic) && new Date(data.nextReview).getTime() <= Date.now();
    })
    .map(([topic, _]) => topic);

  try {
    const out = await chatText({
      projectId: req.projectId,
      providerId: req.providerId,
      model: req.model,
      messages: [
        {
          role: 'system',
          content: `You are an intelligent AI tutor with machine learning-based difficulty prediction.
Analyze the student's learning profile and predict the optimal next topic to study.
Consider:
1. Time pressure (exam date and hours available)
2. Student's learning velocity per topic
3. Current mastery levels and weak areas
4. Spaced repetition schedule (topics due for review)
5. Logical topic dependencies
6. Cognitive load balancing

Return a study plan optimized for exam readiness. Output ONLY valid JSON.`
        },
        {
          role: 'user',
          content: `Syllabus remaining: ${syllabusStr}

Exam in ${daysUntilExam} days, ${totalHoursAvailable} total hours available

Past scores: ${scoresStr}

Learning velocities: ${velocityStr || 'none tracked yet'}

Weak areas needing attention: ${weakConcepts.join(', ') || 'none identified'}

Due for review (spaced repetition): ${dueForReview.join(', ') || 'none due'}

Target score: ${input.targetScore || 75}%

${SCHEMA}`
        }
      ],
      temperature: 0.3,
      maxTokens: 1200
    });
    
    const parsed = parseJSON(out);
    
    if (!parsed || typeof parsed !== 'object') {
      return fallbackPredict(input, m);
    }
    
    return {
      nextTopic: String(parsed.nextTopic || input.syllabus[0] || 'Start with basics'),
      rationale: String(parsed.rationale || 'Based on your current progress and time available'),
      plan: Array.isArray(parsed.plan) ? parsed.plan.map(String) : input.syllabus.slice(0, 5),
      difficulty: Math.min(10, Math.max(1, Number(parsed.difficulty) || 5)),
      estimatedHours: Math.max(1, Number(parsed.estimatedHours) || 3),
      prerequisites: Array.isArray(parsed.prerequisites) ? parsed.prerequisites.map(String) : [],
      recommendedOrder: Array.isArray(parsed.recommendedOrder) ? parsed.recommendedOrder.map(String) : input.syllabus
    };
  } catch (err) {
    // Fallback to rule-based prediction
    return fallbackPredict(input, m);
  }
}

// Rule-based fallback when LLM is unavailable
function fallbackPredict(input: PredictInput, m: any): PredictionResult {
  // Prioritize weak topics first, then unstarted topics
  const scored = input.syllabus.map(topic => {
    const mastery = getConceptMasteryLevel(topic);
    const velocity = getLearningVelocity(topic) || 0.5;
    const score = m.topicScores[topic];
    const attempts = score ? score.correct + score.incorrect : 0;
    
    // Priority score: lower is better (study first)
    let priority = 0;
    
    // Weak topics get highest priority
    if (mastery > 0 && mastery < 60) {
      priority = 10 - mastery / 10;
    }
    // Topics due for review
    else if (m.retentionScores[topic] && new Date(m.retentionScores[topic].nextReview).getTime() <= Date.now()) {
      priority = 5;
    }
    // New topics (never attempted)
    else if (attempts === 0) {
      priority = 6;
    }
    // Already strong topics (maintenance only)
    else if (mastery >= 80) {
      priority = 15;
    }
    // In progress topics
    else {
      priority = 8;
    }
    
    return { topic, priority, mastery, velocity, attempts };
  });
  
  scored.sort((a, b) => a.priority - b.priority);
  const next = scored[0];
  
  return {
    nextTopic: next.topic,
    rationale: next.mastery < 60 
      ? `${next.topic} needs attention (current mastery: ${next.mastery}%)`
      : next.attempts === 0
        ? `${next.topic} is next in logical sequence`
        : `${next.topic} is optimal based on your learning pattern`,
    plan: scored.slice(0, 7).map(s => s.topic),
    difficulty: Math.round(5 + (next.attempts === 0 ? 2 : (100 - next.mastery) / 20)),
    estimatedHours: Math.round((100 - next.mastery) / 10 / Math.max(next.velocity, 0.1)),
    prerequisites: [],
    recommendedOrder: scored.map(s => s.topic)
  };
}

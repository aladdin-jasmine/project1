import { Router } from 'express';
import { getAdvancedAnalytics } from '../study/analytics-advanced.js';
import { 
  getMemory, 
  getStreakDays, 
  getTotalStudyHours,
  getBurnoutRisk,
  getOptimalStudyTime,
  getWeakConcepts,
  getStrongConcepts,
  getConceptsDueForReview,
  getConceptMasteryLevel
} from '../db/memory.js';
import { logger } from '../util/logger.js';

const router = Router();

// Get comprehensive advanced analytics
router.get('/', async (req, res, next) => {
  try {
    const analytics = await getAdvancedAnalytics();
    res.json(analytics);
  } catch (err: any) {
    logger.error('Advanced analytics error:', err?.message || err);
    next(err);
  }
});

// Get learning profile summary
router.get('/profile', async (req, res, next) => {
  try {
    const m = getMemory();
    const profile = {
      streakDays: getStreakDays(),
      totalStudyHours: getTotalStudyHours(),
      burnoutRisk: getBurnoutRisk(),
      optimalStudyTime: getOptimalStudyTime(),
      weakConcepts: getWeakConcepts(60),
      strongConcepts: getStrongConcepts(75),
      conceptsDueForReview: getConceptsDueForReview(),
      totalConcepts: Object.keys(m.conceptMastery).length,
      masteredConcepts: Object.values(m.conceptMastery).filter((c: any) => c.level >= 80).length,
      questionsAsked: m.questionsAsked.length,
      studySessions: m.studySessions.length,
      recentMistakes: m.mistakes.slice(-10)
    };
    res.json(profile);
  } catch (err: any) {
    logger.error('Profile error:', err?.message || err);
    next(err);
  }
});

// Get concept mastery details
router.get('/concept/:concept', async (req, res, next) => {
  try {
    const concept = decodeURIComponent(req.params.concept);
    const m = getMemory();
    const masteryData = m.conceptMastery[concept];
    const topicScore = m.topicScores[concept];
    const retention = m.retentionScores[concept];
    
    const details = {
      concept,
      masteryLevel: getConceptMasteryLevel(concept),
      evidence: masteryData?.evidence || [],
      lastUpdate: masteryData?.lastUpdate,
      quizStats: topicScore ? {
        correct: topicScore.correct,
        incorrect: topicScore.incorrect,
        confidence: topicScore.confidence,
        lastAttempt: topicScore.lastAttempt
      } : null,
      retention: retention ? {
        score: retention.score,
        lastReview: retention.lastReview,
        nextReview: retention.nextReview
      } : null,
      cognitiveLoad: m.cognitiveLoad[concept] || 0,
      learningVelocity: m.learningVelocity[concept] || 0
    };
    
    res.json(details);
  } catch (err: any) {
    logger.error('Concept details error:', err?.message || err);
    next(err);
  }
});

// Get study recommendations
router.get('/recommendations', async (req, res, next) => {
  try {
    const m = getMemory();
    const weakConcepts = getWeakConcepts(60);
    const dueForReview = getConceptsDueForReview();
    const burnoutRisk = getBurnoutRisk();
    const optimalTime = getOptimalStudyTime();
    
    const recommendations = [];
    
    // Burnout warning
    if (burnoutRisk > 70) {
      recommendations.push({
        type: 'warning',
        priority: 'high',
        title: 'High Burnout Risk Detected',
        message: `Your burnout risk is ${burnoutRisk}%. Consider taking a break and spacing out study sessions.`,
        action: 'Take a 1-2 day study break'
      });
    }
    
    // Review reminders
    if (dueForReview.length > 0) {
      recommendations.push({
        type: 'review',
        priority: 'high',
        title: 'Concepts Due for Review',
        message: `${dueForReview.length} concepts need review to maintain retention.`,
        concepts: dueForReview.slice(0, 5),
        action: 'Review these topics today'
      });
    }
    
    // Weak areas
    if (weakConcepts.length > 0) {
      recommendations.push({
        type: 'improvement',
        priority: 'medium',
        title: 'Focus on Weak Areas',
        message: `${weakConcepts.length} concepts below 60% mastery.`,
        concepts: weakConcepts.slice(0, 5),
        action: 'Practice quizzes on these topics'
      });
    }
    
    // Optimal study time
    if (optimalTime) {
      const currentHour = new Date().getHours();
      if (Math.abs(currentHour - optimalTime.hour) <= 2) {
        recommendations.push({
          type: 'timing',
          priority: 'low',
          title: 'Optimal Study Window',
          message: `You learn best around ${optimalTime.hour}:00. You're in your peak learning window!`,
          action: 'Make the most of this time'
        });
      }
    }
    
    // Study streak
    const streakDays = getStreakDays();
    if (streakDays >= 7) {
      recommendations.push({
        type: 'achievement',
        priority: 'low',
        title: `${streakDays} Day Streak! 🔥`,
        message: `You've studied ${streakDays} days in a row. Keep it up!`,
        action: 'Continue your streak tomorrow'
      });
    }
    
    res.json({ recommendations });
  } catch (err: any) {
    logger.error('Recommendations error:', err?.message || err);
    next(err);
  }
});

// Get knowledge graph data
router.get('/graph', async (req, res, next) => {
  try {
    const analytics = await getAdvancedAnalytics();
    
    res.json({
      connections: analytics.conceptConnections,
      nodes: [
        ...analytics.weakTopics.map(t => ({ id: t.topic, type: 'weak', mastery: 100 - t.weakness })),
        ...analytics.strongTopics.map(t => ({ id: t.topic, type: 'strong', mastery: t.masteryLevel }))
      ]
    });
  } catch (err: any) {
    logger.error('Knowledge graph error:', err?.message || err);
    next(err);
  }
});

export default router;

import { Router } from 'express';
import { getProgress, addActivity, addStudyTime, recordQuiz, recordKnowledge, type ActivityType } from '../db/progress.js';
import { recordTopicScore, updateRetentionScore } from '../db/memory.js';

const router = Router();

router.get('/', (_req, res) => res.json(getProgress()));

router.post('/activity', (req, res) => {
  const { type, correct, incorrect, topic, score, minutes } = req.body || {};
  const allowed: ActivityType[] = [
    'slides',
    'flashcards',
    'quiz',
    'chat',
    'mindmap',
    'plan',
    'notes',
    'voice'
  ];
  if (!allowed.includes(type)) return res.status(400).json({ error: 'invalid activity type' });

  // Write to memory when topic + score data arrives
  if (topic && typeof correct === 'number' && typeof incorrect === 'number') {
    recordTopicScore(topic, correct, incorrect);
    updateRetentionScore(topic, correct > incorrect);
  }

  // Record quiz results
  if (type === 'quiz' && typeof score === 'number') {
    recordQuiz(score / 100);
    recordKnowledge(score / 100);
  }

  if (typeof minutes === 'number') addStudyTime(minutes);
  const p = addActivity(type, correct, incorrect, topic);
  res.json(p);
});

export default router;

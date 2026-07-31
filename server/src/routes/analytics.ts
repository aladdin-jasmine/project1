import { Router } from 'express';
import { computeAnalytics } from '../study/analytics.js';

const router = Router();

router.get('/', async (_req, res) => {
  const analytics = await computeAnalytics();
  res.json(analytics);
});

export default router;

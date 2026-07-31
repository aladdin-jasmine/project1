import { Router } from 'express';
import { getSettings, updateSettings, updateTaskConfig } from '../config/settings.js';

const router = Router();

router.get('/', (_req, res) => {
  res.json(getSettings());
});

router.put('/', (req, res) => {
  try {
    const updated = updateSettings(req.body || {});
    res.json(updated);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// New: Get/update task-specific model configuration
router.get('/tasks/:taskType', (req, res) => {
  const settings = getSettings();
  const config = settings.taskConfigs[req.params.taskType as any];
  if (!config) return res.status(404).json({ error: 'Task type not found' });
  res.json(config);
});

router.put('/tasks/:taskType', (req, res) => {
  try {
    const updated = updateTaskConfig(req.params.taskType as any, req.body || {});
    res.json(updated.taskConfigs[req.params.taskType as any]);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

export default router;

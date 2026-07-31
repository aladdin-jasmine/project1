import { Router } from 'express';
import {
  listProviders,
  getProvider,
  getProviderRaw,
  createProvider,
  updateProvider,
  deleteProvider,
  setModels,
  toggleModelEnabled,
  addModelManually
} from '../config/providers.js';
import { loadModels, testProvider } from '../llm/models.js';

const router = Router();

router.get('/', (_req, res) => {
  res.json(listProviders());
});

router.get('/:id', (req, res) => {
  const reveal = req.query.reveal === 'true';
  const p = reveal ? getProviderRaw(req.params.id) : getProvider(req.params.id);
  if (!p) return res.status(404).json({ error: 'Provider not found' });
  res.json(p);
});

router.post('/', (req, res) => {
  try {
    const { name, format, baseUrl, keys, enabled, defaultModel, priority } = req.body || {};
    if (!name || !format || !baseUrl || !Array.isArray(keys) || !keys.length) {
      return res.status(400).json({ error: 'name, format, baseUrl and at least one key are required' });
    }
    const p = createProvider({ name, format, baseUrl, keys, enabled, defaultModel, priority });
    res.status(201).json(p);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const p = updateProvider(req.params.id, req.body || {});
    res.json(p);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/:id', (req, res) => {
  deleteProvider(req.params.id);
  res.json({ ok: true });
});

router.post('/:id/toggle', (req, res) => {
  try {
    const enabled = !!req.body?.enabled;
    const p = updateProvider(req.params.id, { enabled });
    res.json(p);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/:id/test', async (req, res) => {
  try {
    const result = await testProvider(req.params.id);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/models', async (req, res) => {
  try {
    const models = await loadModels(req.params.id);
    const p = setModels(req.params.id, models);
    res.json({ models, provider: p });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// New: Toggle individual model enabled/disabled
router.post('/:id/models/:modelId/toggle', (req, res) => {
  try {
    const enabled = !!req.body?.enabled;
    const p = toggleModelEnabled(req.params.id, req.params.modelId, enabled);
    res.json(p);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// New: Add a model manually
router.post('/:id/models/add', (req, res) => {
  try {
    const { modelId } = req.body || {};
    if (!modelId) {
      return res.status(400).json({ error: 'modelId is required' });
    }
    const p = addModelManually(req.params.id, modelId);
    res.json(p);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

export default router;

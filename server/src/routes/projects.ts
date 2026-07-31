import { Router } from 'express';
import { listProjects, createProject, updateProject, deleteProject } from '../config/projects.js';

const router = Router();

router.get('/', (_req, res) => res.json(listProjects()));

router.post('/', (req, res) => {
  const p = createProject(req.body?.name || 'New Project');
  res.status(201).json(p);
});

router.put('/:id', (req, res) => {
  try {
    const p = updateProject(req.params.id, req.body || {});
    res.json(p);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/:id', (req, res) => {
  deleteProject(req.params.id);
  res.json({ ok: true });
});

export default router;

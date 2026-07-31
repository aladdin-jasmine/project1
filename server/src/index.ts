import express from 'express';
import cors from 'cors';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { ROOT } from './db/store.js';
import { ensureDefaultProject } from './config/projects.js';
import { repairModelLimits } from './config/providers.js';
import { purgeRetiredFeatures } from './db/history.js';
import { logger } from './util/logger.js';

import providersRouter from './routes/providers.js';
import settingsRouter from './routes/settings.js';
import projectsRouter from './routes/projects.js';
import ragRouter from './routes/rag.js';
import studyRouter from './routes/study.js';
import chatRouter from './routes/chat.js';
import progressRouter from './routes/progress.js';
import exportRouter from './routes/export.js';
import analyticsRouter from './routes/analytics.js';
import analyticsAdvancedRouter from './routes/analytics-advanced.js';
import adminRouter from './routes/admin.js';
import voiceRouter from './routes/voice.js';
import agentRouter from './routes/agent.js';
import historyRouter from './routes/history.js';
import sourceRouter from './routes/source.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 5174;

app.use(cors());
app.use(express.json({ limit: '8mb' }));

// API routes
app.use((req, res, next) => {
  const start = Date.now();
  logger.info(`→ ${req.method} ${req.path}`);
  res.on('finish', () => {
    const ms = Date.now() - start;
    const level = res.statusCode >= 400 ? 'warn' : 'info';
    logger[level](`← ${req.method} ${req.path} ${res.statusCode} (${ms}ms)`);
  });
  next();
});

app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.use('/api/providers', providersRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/rag', ragRouter);
app.use('/api/study', studyRouter);
app.use('/api/chat', chatRouter);
app.use('/api/progress', progressRouter);
app.use('/api/export', exportRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/analytics/advanced', analyticsAdvancedRouter);
app.use('/api/admin', adminRouter);
app.use('/api/voice', voiceRouter);
app.use('/api/agent', agentRouter);
app.use('/api/history', historyRouter);
app.use('/api/source', sourceRouter);

// Serve built frontend in production (web/dist)
const webDist = resolve(ROOT, 'web', 'dist');
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(resolve(webDist, 'index.html'));
  });
}

// Boot-time repairs and maintenance
ensureDefaultProject();
repairModelLimits();
const purged = purgeRetiredFeatures();
if (purged > 0) {
  logger.info(`[Boot] Purged ${purged} retired feature item(s) from history`);
}

app.use((err: any, _req: any, res: any, _next: any) => {
  logger.error('Unhandled error:', err?.message || err);
  res.status(500).json({ error: err?.message || 'Internal error' });
});

app.listen(PORT, () => {
  logger.info(`StudyForge server listening on http://localhost:${PORT}`);
  logger.info(`API mounted at /api   (frontend dev proxy → :5173)`);
});

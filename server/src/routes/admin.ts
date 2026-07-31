import { Router } from 'express';
import { readdirSync, statSync } from 'fs';
import { resolve } from 'path';
import { listDocs, stats } from '../rag/vectorstore.js';
import { computeAnalytics, subjectsList } from '../study/analytics.js';
import { readJson, DATA_DIR } from '../db/store.js';
import { pgAll } from '../db/postgres.js';

const router = Router();

router.get('/overview', async (_req, res) => {
  try {
    const docs = listDocs();
    const analytics = await computeAnalytics();
    const subjects = subjectsList();

    let storageBytes = 0;
    try {
      for (const f of readdirSync(DATA_DIR)) {
        const st = statSync(resolve(DATA_DIR, f));
        if (st.isFile()) storageBytes += st.size;
      }
    } catch {}

    const pgLogs = await pgAll<{ type: string; topic: string | null; correct: number; incorrect: number; ts: string }>(
      'SELECT type, topic, correct, incorrect, ts FROM activity_log ORDER BY ts DESC LIMIT 60'
    );
    const logs = pgLogs.length
      ? pgLogs
      : (readJson<{ activityHistory: { date: string; type: string }[] }>('progress', { activityHistory: [] }).activityHistory)
          .slice(-60)
          .map((a) => ({ type: a.type, topic: null, correct: null, incorrect: null, ts: a.date }));

    res.json({
      docCount: docs.length,
      documents: docs,
      subjects,
      storageBytes,
      faiss: stats().faiss,
      analytics,
      logs
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;

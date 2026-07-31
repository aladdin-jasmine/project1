import { Router } from 'express';
import { runAgentPipeline, type AgentRunRequest } from '../agents/orchestrator.js';

const router = Router();

// Agentic pipeline — Planner → Retriever → Reranker → Answer → Quiz → Memory → Recommender.
// Streams step events + answer tokens over SSE so the UI can render a live trace.
router.post('/run', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const send = (obj: any) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  try {
    const body = req.body as AgentRunRequest;
    if (!body?.question?.trim()) {
      send({ error: 'Missing question' });
      return res.end();
    }
    const result = await runAgentPipeline(body, (evt) => send(evt));
    send({ done: true, result });
  } catch (e: any) {
    send({ error: e.message || String(e) });
  } finally {
    res.end();
  }

  req.on('close', () => res.end());
});

export default router;

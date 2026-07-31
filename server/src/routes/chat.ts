import { Router } from 'express';
import { ragChat } from '../rag/chat.js';
import { readJson, writeJson } from '../db/store.js';
import type { ChatRequest, ChatSession } from '../types.js';

const router = Router();

// Non-streaming RAG chat
router.post('/', async (req, res) => {
  try {
    const r = await ragChat({ ...req.body, taskType: 'chat' } as ChatRequest);
    res.json({
      content: r.content,
      citations: r.citations,
      confidence: r.confidence,
      sessionId: r.sessionId,
      memoryNote: r.memoryNote,
      providerId: r.providerId,
      model: r.model,
      truncated: r.truncated
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Streaming RAG chat (Server-Sent Events)
router.post('/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const send = (obj: any) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  try {
    const r = await ragChat({ ...req.body, taskType: 'chat' } as ChatRequest, (token) => send({ token }));
    send({
      done: true,
      citations: r.citations,
      confidence: r.confidence,
      sessionId: r.sessionId,
      memoryNote: r.memoryNote,
      providerId: r.providerId,
      model: r.model,
      truncated: r.truncated
    });
  } catch (e: any) {
    send({ error: e.message || String(e) });
  } finally {
    res.end();
  }

  req.on('close', () => res.end());
});

// Chat session history
router.get('/sessions', (_req, res) => {
  const all = readJson<ChatSession[]>('chats', []);
  res.json(
    all.map((s) => ({ id: s.id, title: s.title, updatedAt: s.updatedAt, messageCount: s.messages.length }))
  );
});

router.get('/sessions/:id', (req, res) => {
  const all = readJson<ChatSession[]>('chats', []);
  const s = all.find((x) => x.id === req.params.id);
  if (!s) return res.status(404).json({ error: 'Not found' });
  res.json(s);
});

router.delete('/sessions/:id', (req, res) => {
  const all = readJson<ChatSession[]>('chats', []);
  writeJson('chats', all.filter((x) => x.id !== req.params.id));
  res.json({ ok: true });
});

// Patch session metadata (learningStyle, explainLevel, collection)
router.patch('/sessions/:id', (req, res) => {
  try {
    const all = readJson<ChatSession[]>('chats', []);
    const s = all.find((x) => x.id === req.params.id);
    if (!s) return res.status(404).json({ error: 'Not found' });
    if (req.body?.meta && typeof req.body.meta === 'object') {
      s.meta = { ...(s.meta || {}), ...req.body.meta };
    }
    writeJson('chats', all);
    res.json({ id: s.id, meta: s.meta });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;

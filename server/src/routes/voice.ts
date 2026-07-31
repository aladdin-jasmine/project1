import { Router } from 'express';
import multer from 'multer';
import { transcribeAudio, synthesizeSpeech, voiceStatus } from '../voice/speech.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 } // Groq free tier: 25 MB per file
});

// Capability discovery — lets the frontend decide server voice vs Web Speech fallback.
router.get('/status', (_req, res) => {
  res.json(voiceStatus());
});

// Speech → Text. multipart form-data, field "audio" (webm/ogg/wav/m4a blob from MediaRecorder).
router.post('/stt', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Missing audio file (field "audio")' });
    const r = await transcribeAudio(req.file.buffer, req.file.mimetype || 'audio/webm', {
      providerId: req.body?.providerId,
      language: req.body?.language
    });
    res.json({ text: r.text, model: r.model, providerId: r.providerId });
  } catch (e: any) {
    res.status(502).json({ error: e.message || 'Transcription failed' });
  }
});

// Text → Speech. JSON { text, voice?, providerId? } → audio/wav stream.
router.post('/tts', async (req, res) => {
  try {
    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Missing text' });
    const r = await synthesizeSpeech(text, { providerId: req.body?.providerId, voice: req.body?.voice });
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('X-Voice-Model', r.model);
    res.send(r.buffer);
  } catch (e: any) {
    res.status(502).json({ error: e.message || 'Speech synthesis failed' });
  }
});

export default router;

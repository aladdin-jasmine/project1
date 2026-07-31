import { Router } from 'express';
import { buildPptx, buildFlashcardsTsv, buildQuizCsv, buildRevisionPdf, buildNotesMd } from '../study/export.js';

const router = Router();

router.post('/pptx', async (req, res) => {
  try {
    const buf = await buildPptx(req.body);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(req.body?.title || 'slides')}.pptx"`);
    res.send(buf);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/flashcards-tsv', (req, res) => {
  const tsv = buildFlashcardsTsv(req.body);
  res.setHeader('Content-Type', 'text/tab-separated-values');
  res.setHeader('Content-Disposition', `attachment; filename="${(req.body?.title || 'flashcards').replace(/\s+/g, '_')}.tsv"`);
  res.send(tsv);
});

router.post('/quiz-csv', (req, res) => {
  const csv = buildQuizCsv(req.body);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${(req.body?.title || 'quiz').replace(/\s+/g, '_')}.csv"`);
  res.send(csv);
});

router.post('/revision-pdf', async (req, res) => {
  try {
    const buf = await buildRevisionPdf(req.body?.title || 'Revision Sheet', req.body?.topics || []);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${(req.body?.title || 'revision').replace(/\s+/g, '_')}.pdf"`);
    res.send(buf);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/notes-md', (req, res) => {
  try {
    const md = buildNotesMd(req.body);
    res.setHeader('Content-Type', 'text/markdown');
    res.setHeader('Content-Disposition', `attachment; filename="${(req.body?.title || 'notes').replace(/\s+/g, '_')}.md"`);
    res.send(md);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;

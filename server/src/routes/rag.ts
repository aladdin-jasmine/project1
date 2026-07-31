import { Router } from 'express';
import multer from 'multer';
import { ingestDocument } from '../rag/ingest.js';
import { listDocs, deleteDoc, stats, getDoc, getChunksByDoc, allChunks } from '../rag/vectorstore.js';
import { retrieve } from '../rag/retrieve.js';
import { saveStaged, listStaged, getStagedFile, deleteStaged, clearAllStaged, type StagedFile } from '../db/staged.js';
import { createFolder, getTree, renameFolder, deleteFolder, moveDoc, autoOrganize, getAllFolderPaths } from '../db/folders.js';
import type { Collection } from '../types.js';
import { logger } from '../util/logger.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 60 * 1024 * 1024, files: 50 } });

// ── Document listing ──
router.get('/docs', (req, res) => {
  const collection = (req.query.collection as Collection) || undefined;
  res.json(listDocs(collection));
});
router.get('/stats', (_req, res) => res.json(stats()));
router.get('/docs/:id', (req, res) => {
  const d = getDoc(req.params.id);
  if (!d) return res.status(404).json({ error: 'Not found' });
  res.json(d);
});
router.delete('/docs/:id', (req, res) => {
  deleteDoc(req.params.id);
  res.json({ ok: true });
});

// ── Chunk viewer ──
router.get('/docs/:id/chunks', (req, res) => {
  const d = getDoc(req.params.id);
  if (!d) return res.status(404).json({ error: 'Doc not found' });
  const chunks = getChunksByDoc(req.params.id);
  res.json({ doc: d, chunks: chunks.map(({ embedding, ...rest }) => rest) });
});

// ── Direct upload + ingest (legacy, one-step) ──
router.post('/upload', upload.array('files', 20), async (req, res) => {
  try {
    const files = (req.files as Express.Multer.File[]) || [];
    if (!files.length) return res.status(400).json({ error: 'No file(s) uploaded' });
    const collection: Collection = req.body.collection === 'qpapers' ? 'qpapers' : 'kb';
    const meta = {
      book: req.body.book || undefined,
      subject: req.body.subject || undefined,
      chapter: req.body.chapter || undefined,
      semester: req.body.semester || undefined,
      difficulty: req.body.difficulty || undefined,
      ocr: req.body.ocr === 'true' || req.body.ocr === true
    };
    const results = [];
    for (const f of files) {
      try {
        const ext = f.originalname.split('.').pop()?.toLowerCase() || 'txt';
        const r = await ingestDocument(f.buffer, f.originalname, ext, { ...meta, collection });
        results.push({ name: f.originalname, docId: r.doc.id, chunkCount: r.chunkCount, ocrUsed: r.ocrUsed });
      } catch (e: any) {
        results.push({ name: f.originalname, error: e?.message || String(e) });
        logger.warn(`Ingest failed for ${f.originalname}:`, e?.message || e);
      }
    }
    const failed = results.filter((r) => r.error).length;
    res.status(failed && failed === files.length ? 500 : 201).json({ results, collection, partial: failed > 0 });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Staged upload (upload without processing) ──
router.post('/upload/stage', upload.array('files', 50), async (req, res) => {
  try {
    const files = (req.files as Express.Multer.File[]) || [];
    if (!files.length) return res.status(400).json({ error: 'No file(s) uploaded' });
    const staged: StagedFile[] = [];
    for (const f of files) {
      const ext = f.originalname.split('.').pop()?.toLowerCase() || 'txt';
      const sf = saveStaged(f.buffer, f.originalname, ext, {
        book: req.body.book || undefined,
        subject: req.body.subject || undefined,
        chapter: req.body.chapter || undefined,
        semester: req.body.semester || undefined,
        difficulty: req.body.difficulty || undefined,
        ocr: req.body.ocr === 'true' || req.body.ocr === true,
        collection: req.body.collection || 'kb',
      });
      staged.push(sf);
    }
    res.status(201).json({ staged, count: staged.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/staged', (_req, res) => {
  res.json(listStaged());
});

router.delete('/staged/:id', (req, res) => {
  deleteStaged(req.params.id);
  res.json({ ok: true });
});

router.post('/staged/clear', (_req, res) => {
  const count = clearAllStaged();
  res.json({ cleared: count });
});

// ── Process staged files (extract → chunk → embed → store) ──
router.post('/process/:id', async (req, res) => {
  try {
    const staged = getStagedFile(req.params.id);
    if (!staged) return res.status(404).json({ error: 'Staged file not found' });
    const sf = staged.meta;
    const result = await ingestDocument(staged.buffer, sf.fileName, sf.type, {
      book: sf.metadata.book,
      chapter: sf.metadata.chapter,
      subject: sf.metadata.subject,
      semester: sf.metadata.semester,
      difficulty: sf.metadata.difficulty as any,
      ocr: sf.metadata.ocr,
      collection: (sf.metadata.collection as Collection) || 'kb',
    });
    // Auto-organize into folders
    autoOrganize(result.doc.id, {
      subject: sf.metadata.subject,
      semester: sf.metadata.semester,
      book: sf.metadata.book,
      chapter: sf.metadata.chapter,
    });
    // Remove from staging
    deleteStaged(req.params.id);
    res.json({ doc: result.doc, chunkCount: result.chunkCount, ocrUsed: result.ocrUsed });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/process/batch', async (req, res) => {
  try {
    const ids: string[] = req.body.ids || [];
    const results: { id: string; fileName: string; status: string; docId?: string; chunkCount?: number; error?: string }[] = [];
    for (const id of ids) {
      try {
        const staged = getStagedFile(id);
        if (!staged) { results.push({ id, fileName: 'unknown', status: 'error', error: 'Not found' }); continue; }
        const result = await ingestDocument(staged.buffer, staged.meta.fileName, staged.meta.type, {
          book: staged.meta.metadata.book,
          chapter: staged.meta.metadata.chapter,
          subject: staged.meta.metadata.subject,
          semester: staged.meta.metadata.semester,
          difficulty: staged.meta.metadata.difficulty as any,
          ocr: staged.meta.metadata.ocr,
          collection: (staged.meta.metadata.collection as Collection) || 'kb',
        });
        autoOrganize(result.doc.id, {
          subject: staged.meta.metadata.subject,
          semester: staged.meta.metadata.semester,
          book: staged.meta.metadata.book,
          chapter: staged.meta.metadata.chapter,
        });
        deleteStaged(id);
        results.push({ id, fileName: staged.meta.fileName, status: 'ok', docId: result.doc.id, chunkCount: result.chunkCount });
      } catch (e: any) {
        results.push({ id, fileName: 'unknown', status: 'error', error: e.message });
      }
    }
    res.json({ results });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Folder management ──
router.post('/folders', (req, res) => {
  try {
    const { name, parentId } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Folder name required' });
    const folder = createFolder(name.trim(), parentId);
    res.status(201).json(folder);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/folders', (_req, res) => {
  res.json(getTree());
});

router.get('/folders/paths', (_req, res) => {
  res.json(getAllFolderPaths());
});

router.put('/folders/:id', (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Folder name required' });
    res.json(renameFolder(req.params.id, name.trim()));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/folders/:id', (req, res) => {
  try {
    deleteFolder(req.params.id);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/docs/:id/move', (req, res) => {
  try {
    const { toFolderId, fromFolderId } = req.body;
    moveDoc(req.params.id, toFolderId, fromFolderId);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Query ──
router.post('/query', async (req, res) => {
  try {
    const { query, k = 5, docIds, collection } = req.body || {};
    if (!query) return res.status(400).json({ error: 'query required' });
    const chunks = await retrieve(query, k, { docIds, collection });
    res.json(chunks.map(({ embedding, ...c }) => c));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;

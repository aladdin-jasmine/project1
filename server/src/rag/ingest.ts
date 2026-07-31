import { randomUUID } from 'crypto';
import { extract } from './parse.js';
import { ocrPdf } from './ocr.js';
import { buildChunks, buildChunksFromPages, toDocChunks, type ChunkInput } from './chunk.js';
import { embedTexts } from '../llm/embeddings.js';
import { addDoc, addChunks } from './vectorstore.js';
import { logDocument } from '../db/postgres.js';
import type { DocChunk, KnowledgeDoc, Collection } from '../types.js';
import { logger } from '../util/logger.js';

function deriveTopics(text: string, headings: string[]): string[] {
  const stop = new Set(
    ('the a an and or but if then else when at by for with about against between into through during before after above below to from up down in out on off over under this that these those is are was were be been being have has had do does did will would shall should can could of as not no nor so than too very just which who whom whose what where why how all any both each few more most other some such only own same s t').split(' ')
  );
  const topics = new Set<string>(headings.slice(0, 6));
  const words = text.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter((w) => w.length > 3 && !stop.has(w) && !/^\d+$/.test(w));
  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
  const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([w]) => w);
  for (const t of top) topics.add(t);
  return [...topics].slice(0, 10);
}

export interface IngestOptions extends ChunkInput {
  collection?: Collection;
  ocr?: boolean; // force OCR attempt even if some text exists
}

export interface IngestResult {
  doc: KnowledgeDoc;
  chunkCount: number;
  ocrUsed: boolean;
}

export async function ingestDocument(
  buffer: Buffer,
  fileName: string,
  type: string,
  opts: IngestOptions = {}
): Promise<IngestResult> {
  const collection: Collection = opts.collection || 'kb';
  const base: ChunkInput = {
    book: opts.book,
    chapter: opts.chapter,
    subject: opts.subject,
    semester: opts.semester,
    difficulty: opts.difficulty,
    collection
  };

  let ex = await extract(buffer, type);
  let text = ex.text;
  let ocrUsed = false;

  // OCR path for scanned PDFs (or forced)
  if (type.toLowerCase() === 'pdf' && (ex.imageHeavy || opts.ocr) && (!text || text.replace(/\s/g, '').length < 80)) {
    const ocr = await ocrPdf(buffer);
    if (ocr && ocr.text.trim()) {
      text = ocr.text;
      ex = { ...ex, text: ocr.text, pages: undefined, pageCount: ocr.pages };
      ocrUsed = true;
    }
  }

  if (!text.trim()) throw new Error('Could not extract text from file (OCR also failed).');

  // Build chunks (per-page for PDF to keep accurate page numbers)
  const tuples =
    ex.pages && ex.pages.length
      ? buildChunksFromPages(ex.pages, base).map((c) => ({ text: c.text, meta: { ...c.meta, page: c.page } }))
      : buildChunks(text, base as any);

  const docId = randomUUID();
  const headings = tuples.map((t) => t.meta.heading || '').filter(Boolean).slice(0, 12);
  const topics = deriveTopics(text, headings);

  const partial = toDocChunks(tuples, docId, collection);
  const embeddings = await embedTexts(partial.map((c) => c.text));
  const chunks: DocChunk[] = partial.map((c, i) => ({ ...c, embedding: embeddings[i] }));

  const doc: KnowledgeDoc = {
    id: docId,
    name: fileName,
    type: type.toLowerCase(),
    size: buffer.length,
    chunks: chunks.length,
    topics,
    createdAt: new Date().toISOString(),
    collection,
    book: opts.book,
    chapter: opts.chapter,
    subject: opts.subject,
    semester: opts.semester,
    difficulty: opts.difficulty,
    ocr: ocrUsed || undefined,
    pages: ex.pageCount
  };

  addDoc(doc);
  await addChunks(chunks);
  logDocument({ id: doc.id, name: doc.name, type: doc.type, collection: doc.collection, size: doc.size, chunks: doc.chunks });
  logger.info(`Ingested "${fileName}" → ${chunks.length} chunks (collection=${collection}, ocr=${ocrUsed})`);
  return { doc, chunkCount: chunks.length, ocrUsed };
}

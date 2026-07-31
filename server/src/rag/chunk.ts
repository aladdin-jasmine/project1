import { cleanText, isHeading } from './parse.js';
import type { ChunkMeta, DocChunk } from '../types.js';

const TARGET = 850;
const OVERLAP = 120;

export interface ChunkInput {
  book?: string;
  chapter?: string;
  subject?: string;
  semester?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  collection?: 'kb' | 'qpapers';
}

// Split a section into overlapping chunks at paragraph/sentence boundaries.
function splitSection(text: string, heading: string, meta: ChunkMeta): { text: string; meta: ChunkMeta }[] {
  const clean = cleanText(text);
  if (!clean) return [];
  const paras = clean.split(/\n{1,}/).filter((p) => p.trim());
  const chunks: { text: string; meta: ChunkMeta }[] = [];
  let cur = '';
  for (const para of paras) {
    if ((cur + '\n\n' + para).length <= TARGET) {
      cur = cur ? cur + '\n\n' + para : para;
    } else {
      if (cur) chunks.push({ text: cur, meta: { ...meta, heading: heading || meta.heading } });
      if (para.length > TARGET) {
        for (let i = 0; i < para.length; i += TARGET - OVERLAP) {
          chunks.push({ text: para.slice(i, i + TARGET), meta: { ...meta, heading } });
        }
        cur = '';
      } else cur = para;
    }
  }
  if (cur) chunks.push({ text: cur, meta: { ...meta, heading: heading || meta.heading } });
  return chunks;
}

// Semantic chunking: split by detected headings, then chunk each section.
export function buildChunks(text: string, meta: ChunkMeta = {}): { text: string; meta: ChunkMeta }[] {
  const clean = cleanText(text);
  const lines = clean.split('\n');
  const sections: { heading: string; body: string }[] = [];
  let current = { heading: '', body: '' };
  for (const line of lines) {
    if (isHeading(line)) {
      if (current.heading || current.body.trim()) sections.push({ ...current });
      current = { heading: line.trim(), body: '' };
    } else {
      current.body += (current.body ? '\n' : '') + line;
    }
  }
  if (current.heading || current.body.trim()) sections.push({ ...current });

  if (!sections.length) return splitSection(clean, '', meta);

  const out: { text: string; meta: ChunkMeta }[] = [];
  for (const s of sections) {
    out.push(...splitSection(s.body || s.heading, s.heading, meta));
  }
  return out.length ? out : splitSection(clean, '', meta);
}

// Chunk a document that has per-page text (PDF), preserving accurate page numbers.
export function buildChunksFromPages(
  pages: string[],
  base: ChunkInput
): { text: string; meta: ChunkMeta; page: number }[] {
  const metaBase: ChunkMeta = {
    book: base.book,
    chapter: base.chapter,
    subject: base.subject,
    semester: base.semester,
    difficulty: base.difficulty
  };
  const out: { text: string; meta: ChunkMeta; page: number }[] = [];
  pages.forEach((pText, idx) => {
    const chunks = buildChunks(pText, metaBase);
    for (const c of chunks) out.push({ ...c, page: idx + 1 });
  });
  return out;
}

// Convert raw chunk tuples into DocChunk objects ready for embedding + storage.
export function toDocChunks(
  tuples: { text: string; meta: ChunkMeta }[],
  docId: string,
  collection: 'kb' | 'qpapers'
): Omit<DocChunk, 'embedding'>[] {
  return tuples.map((t) => ({
    id: crypto.randomUUID(),
    docId,
    text: t.text,
    meta: { ...t.meta, section: t.meta.heading },
    collection
  }));
}

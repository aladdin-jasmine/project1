import faiss from 'faiss-node';
const { Index, IndexFlatIP } = faiss;
import { readJson, writeJson, dataPath } from '../db/store.js';
import type { DocChunk, Collection } from '../types.js';
import { logger } from '../util/logger.js';

interface FaissMeta {
  ids: string[];
  docIds: string[];
  texts: string[];
  collections: string[];
  pages: number[];
  headings: string[];
  subjects: string[];
}

let index: any = null;
let meta: FaissMeta = { ids: [], docIds: [], texts: [], collections: [], pages: [], headings: [], subjects: [] };
let ready = false;

function persistIndex(): void {
  if (!index) return;
  try {
    index.write(dataPath('faiss.index'));
    writeJson('faiss-meta', meta);
  } catch (e: any) {
    logger.warn('FAISS persist failed:', e?.message || e);
  }
}

function tryLoad(): boolean {
  const indexPath = dataPath('faiss.index');
  try {
    const raw = readJson<FaissMeta | null>('faiss-meta', null);
    if (!raw || !raw.ids.length) return false;
    index = Index.read(indexPath);
    meta = raw;
    ready = true;
    logger.info(`FAISS index loaded (${meta.ids.length} vectors)`);
    return true;
  } catch {
    return false;
  }
}

function rebuild(): void {
  const { chunks } = readJson<{ chunks: DocChunk[] }>('vectors', { chunks: [] });
  const valid = chunks.filter((c): c is DocChunk & { embedding: number[] } =>
    !!c.embedding && c.embedding.length > 0
  );

  if (!valid.length) {
    index = null;
    meta = { ids: [], docIds: [], texts: [], collections: [], pages: [], headings: [], subjects: [] };
    ready = false;
    try { writeJson('faiss-meta', meta); } catch {}
    return;
  }

  const dim = valid[0].embedding.length;
  const idx = new IndexFlatIP(dim);
  const flat: number[] = [];
  const m: FaissMeta = {
    ids: [], docIds: [], texts: [], collections: [], pages: [], headings: [], subjects: [],
  };

  for (let i = 0; i < valid.length; i++) {
    const c = valid[i];
    let n = 0;
    for (const x of c.embedding) n += x * x;
    n = Math.sqrt(n) || 1;
    for (const x of c.embedding) flat.push(x / n);
    m.ids.push(c.id);
    m.docIds.push(c.docId);
    m.texts.push(c.text);
    m.collections.push(c.collection || 'kb');
    m.pages.push(c.meta.page ?? -1);
    m.headings.push(c.meta.heading || '');
    m.subjects.push(c.meta.subject || '');
  }

  idx.add(flat);
  index = idx;
  meta = m;
  ready = true;
  logger.info(`FAISS index built (${valid.length} vectors, dim=${dim})`);
  persistIndex();
}

function ensure(): boolean {
  if (ready && index) return true;
  if (tryLoad()) return true;
  rebuild();
  return ready;
}

export function ensureFaiss(): boolean {
  return ensure();
}

export function faissSearch(
  qe: number[], k: number, opts?: { docIds?: string[]; collection?: Collection }
): DocChunk[] | null {
  if (!ensure() || !index) return null;
  try {
    let qn = 0;
    for (const x of qe) qn += x * x;
    qn = Math.sqrt(qn) || 1;
    const query = qe.map(x => x / qn);
    const result: any = index.search(query, Math.min(k, meta.ids.length));
    const labels: number[] = Array.from(result.labels);
    const distances: number[] = Array.from(result.distances);

    const chunks: DocChunk[] = [];
    for (let i = 0; i < labels.length; i++) {
      const pos = labels[i];
      if (pos < 0) continue;

      if (opts?.collection && meta.collections[pos] !== opts.collection) continue;
      if (opts?.docIds?.length && !opts.docIds.includes(meta.docIds[pos])) continue;

      chunks.push({
        id: meta.ids[pos],
        docId: meta.docIds[pos],
        text: meta.texts[pos],
        meta: {
          page: meta.pages[pos] > 0 ? meta.pages[pos] : undefined,
          heading: meta.headings[pos] || undefined,
          subject: meta.subjects[pos] || undefined,
        },
        collection: meta.collections[pos] as Collection,
        score: distances[i],
      });
    }

    return chunks.slice(0, k);
  } catch (e: any) {
    logger.warn('FAISS search failed:', e?.message || e);
    return null;
  }
}

export function faissAdd(chunks: DocChunk[]): void {
  const valid = chunks.filter((c): c is DocChunk & { embedding: number[] } =>
    !!c.embedding && c.embedding.length > 0
  );
  if (!valid.length) return;

  if (!ensure()) {
    rebuild();
    return;
  }

  if (!index) {
    rebuild();
    return;
  }

  const flat: number[] = [];

  for (let i = 0; i < valid.length; i++) {
    const c = valid[i];
    let n = 0;
    for (const x of c.embedding) n += x * x;
    n = Math.sqrt(n) || 1;
    for (const x of c.embedding) flat.push(x / n);
    meta.ids.push(c.id);
    meta.docIds.push(c.docId);
    meta.texts.push(c.text);
    meta.collections.push(c.collection || 'kb');
    meta.pages.push(c.meta.page ?? -1);
    meta.headings.push(c.meta.heading || '');
    meta.subjects.push(c.meta.subject || '');
  }

  index.add(flat);
  persistIndex();
}

export function faissDelete(): void {
  rebuild();
}

export function faissStatus(): boolean {
  return ensure();
}

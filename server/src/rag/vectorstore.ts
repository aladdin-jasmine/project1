import { readJson, writeJson } from '../db/store.js';
import type { DocChunk, KnowledgeDoc, Collection } from '../types.js';
import { faissSearch, faissAdd, faissDelete, ensureFaiss } from './faiss-store.js';

interface VectorDB {
  chunks: DocChunk[];
  docs: KnowledgeDoc[];
}

let cache: VectorDB | null = null;

function load(): VectorDB {
  if (!cache) cache = readJson<VectorDB>('vectors', { chunks: [], docs: [] });
  return cache;
}
function persist(): void {
  if (cache) writeJson('vectors', cache);
}

// ---------------- Public API ----------------
export function listDocs(collection?: Collection): KnowledgeDoc[] {
  const docs = load().docs.filter((d) => (collection ? d.collection === collection : true));
  return docs.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function getDoc(id: string): KnowledgeDoc | undefined {
  return load().docs.find((d) => d.id === id);
}

export function addDoc(doc: KnowledgeDoc): void {
  const db = load();
  db.docs.push(doc);
  persist();
}

export function deleteDoc(id: string): void {
  const db = load();
  db.docs = db.docs.filter((d) => d.id !== id);
  db.chunks = db.chunks.filter((c) => c.docId !== id);
  persist();
  faissDelete();
}

export async function addChunks(chunks: DocChunk[]): Promise<void> {
  const db = load();
  db.chunks.push(...chunks);
  persist();
  faissAdd(chunks);
}

export function allChunks(collection?: Collection): DocChunk[] {
  const c = load().chunks;
  return collection ? c.filter((x) => (x.collection || 'kb') === collection) : c;
}

export function getChunksByDoc(docId: string): DocChunk[] {
  return load().chunks.filter((c) => c.docId === docId);
}

// Vector similarity search (FAISS when available, else local cosine).
export async function search(
  queryEmbedding: number[],
  k = 6,
  opts?: { docIds?: string[]; collection?: Collection }
): Promise<DocChunk[]> {
  const faissRes = faissSearch(queryEmbedding, k, opts);
  if (faissRes) return faissRes;

  // local cosine fallback
  const db = load();
  const q = queryEmbedding;
  let qn = 0;
  for (const v of q) qn += v * v;
  qn = Math.sqrt(qn) || 1;

  const scored = db.chunks
    .filter((c) => (opts?.collection ? (c.collection || 'kb') === opts.collection : true))
    .filter((c) => (opts?.docIds && opts.docIds.length ? opts.docIds.includes(c.docId) : true))
    .map((c) => {
      const e = c.embedding || [];
      if (e.length !== q.length || e.length === 0) return { ...c, score: 0 };
      let dot = 0;
      let n = 0;
      for (let i = 0; i < e.length; i++) dot += e[i] * q[i];
      for (const v of e) n += v * v;
      n = Math.sqrt(n) || 1;
      return { ...c, score: dot / (qn * n) };
    })
    .sort((a, b) => (b.score || 0) - (a.score || 0));
  return scored.slice(0, k);
}

export function stats() {
  const db = load();
  return { docs: db.docs.length, chunks: db.chunks.length, faiss: ensureFaiss() };
}

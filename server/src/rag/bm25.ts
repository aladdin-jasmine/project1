import { allChunks } from './vectorstore.js';
import type { DocChunk, Collection } from '../types.js';

const STOP = new Set(
  ('the a an and or but if then else when at by for with about against between into through during before after above below to from up down in out on off over under this that these those is are was were be been being have has had do does did will would shall should can could of as not no nor so than too very just which who whom whose what where why how all any both each few more most other some such only own same s t').split(' ')
);

export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
}

// BM25 keyword search over the chunk corpus. Cheap for local corpora.
export function bm25Search(query: string, k: number, opts?: { docIds?: string[]; collection?: Collection }): DocChunk[] {
  const chunks = allChunks(opts?.collection).filter((c) =>
    opts?.docIds && opts.docIds.length ? opts.docIds.includes(c.docId) : true
  );
  const qTokens = tokenize(query);
  if (!qTokens.length || !chunks.length) return [];

  const N = chunks.length;
  const k1 = 1.5;
  const b = 0.75;

  const docToks = chunks.map((c) => {
    const t = tokenize(c.text);
    const tf = new Map<string, number>();
    for (const w of t) tf.set(w, (tf.get(w) || 0) + 1);
    return { tf, dl: t.length || 1 };
  });
  const avgdl = docToks.reduce((s, d) => s + d.dl, 0) / N;

  // document frequency for each query term
  const df = new Map<string, number>();
  for (const qt of qTokens) {
    let d = 0;
    for (const dt of docToks) if (dt.tf.has(qt)) d++;
    df.set(qt, d);
  }

  const scored = chunks.map((c, i) => {
    let score = 0;
    const { tf, dl } = docToks[i];
    for (const qt of qTokens) {
      const f = tf.get(qt);
      if (!f) continue;
      const d = df.get(qt) || 0;
      const idf = Math.log(1 + (N - d + 0.5) / (d + 0.5));
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + b * (dl / avgdl))));
    }
    return { ...c, score };
  });

  return scored.filter((s) => s.score > 0).sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, k);
}

// Reciprocal Rank Fusion of multiple result lists.
export function fuseRank(lists: DocChunk[][], k = 60): DocChunk[] {
  const m = new Map<string, { chunk: DocChunk; score: number }>();
  for (const list of lists) {
    list.forEach((c, rank) => {
      const s = 1 / (k + rank + 1);
      const ex = m.get(c.id);
      if (ex) ex.score += s;
      else
        m.set(c.id, {
          chunk: { ...c },
          score: s
        });
    });
  }
  return [...m.values()]
    .sort((a, b) => b.score - a.score)
    .map((x) => ({ ...x.chunk, score: x.score }));
}

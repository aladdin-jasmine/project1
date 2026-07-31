import { embedOne } from '../llm/embeddings.js';
import { search } from './vectorstore.js';
import { bm25Search, fuseRank } from './bm25.js';
import { rerank } from './rerank.js';
import { chatText } from '../llm/client.js';
import { getSettings } from '../config/settings.js';
import type { DocChunk, Collection } from '../types.js';

export interface RetrieveOpts {
  docIds?: string[];
  collection?: Collection;
}

// Generate 3 alternative phrasings to improve recall (best-effort).
async function subQueries(query: string): Promise<string[]> {
  try {
    const out = await chatText({
      messages: [
        {
          role: 'system',
          content:
            'Generate 3 alternative search queries that retrieve different relevant perspectives for the user question. Return ONLY a JSON array of 3 strings.'
        },
        { role: 'user', content: query }
      ],
      temperature: 0.4,
      maxTokens: 300
    });
    let t = out.trim();
    const f = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (f) t = f[1].trim();
    const s = t.indexOf('[');
    const e = t.lastIndexOf(']');
    if (s >= 0 && e >= 0) {
      const arr = JSON.parse(t.slice(s, e + 1));
      if (Array.isArray(arr)) return arr.map(String).slice(0, 3);
    }
  } catch {
    /* ignore */
  }
  return [];
}

// Hybrid retrieval: BM25 + vector (RRF fusion), optional multi-query expansion,
// optional cross-encoder reranking. Returns the top-k chunks.
export async function retrieve(query: string, k = 5, opts: RetrieveOpts = {}): Promise<DocChunk[]> {
  const settings = getSettings();
  let candidates: DocChunk[] = [];
  if (settings.hybridSearch) {
    // Lexical retrieval remains useful (and must remain available) when an
    // embedding provider or local model is temporarily unavailable.
    let vec: DocChunk[] = [];
    try {
      vec = await search(await embedOne(query), k * 4, opts);
    } catch {
      vec = [];
    }
    const bm = bm25Search(query, k * 4, opts);
    candidates = vec.length ? fuseRank([vec, bm], 60).slice(0, k * 3) : bm.slice(0, k * 3);
  } else {
    try {
      candidates = await search(await embedOne(query), k * 2, opts);
    } catch {
      candidates = bm25Search(query, k * 2, opts);
    }
  }

  // Expansion only pays for itself when there is a corpus to expand into.
  if (settings.multiQuery && candidates.length) {
    const subs = await subQueries(query);
    // Fan the alternate phrasings out together — they are independent, and run
    // serially they added three embed+search round trips to every request.
    const expansions = await Promise.all(
      subs.map(async (q) => {
        try {
          return await search(await embedOne(q), k, opts);
        } catch {
          return [] as DocChunk[];
        }
      })
    );
    for (const more of expansions) candidates.push(...more);

    const map = new Map<string, DocChunk>();
    for (const c of candidates) {
      const ex = map.get(c.id);
      if (!ex || (c.score || 0) > (ex.score || 0)) map.set(c.id, c);
    }
    candidates = [...map.values()];
  }

  let final = candidates;
  if (settings.reranker) {
    const r = await rerank(query, candidates, k, settings.rerankerModel);
    final = r || candidates;
  }
  final = final.sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, k);

  // Gate on relevance: if all chunks score too low, return nothing so the caller
  // can fall back to model knowledge instead of injecting noise as "PRIMARY SOURCE".
  // A score of 0.5+ is typical for even loosely related results; below 0.3 is noise.
  const minScore = 0.3;
  return final.filter((c) => (c.score || 0) >= minScore);
}

import type { DocChunk } from '../types.js';
import { logger } from '../util/logger.js';

let tok: any = null;
let model: any = null;
let modelName = '';
let failed = false;

async function load(modelId: string): Promise<boolean> {
  if (tok && model && modelName === modelId) return true;
  if (failed) return false;
  try {
    const { AutoTokenizer, AutoModelForSequenceClassification } = await import('@xenova/transformers');
    tok = await AutoTokenizer.from_pretrained(modelId);
    model = await AutoModelForSequenceClassification.from_pretrained(modelId);
    modelName = modelId;
    return true;
  } catch (e: any) {
    logger.warn('Reranker model failed to load:', e?.message || e);
    failed = true;
    return false;
  }
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

// Cross-encoder reranking of candidates against the query.
// Returns re-ordered chunks (top k) or null if the reranker is unavailable.
export async function rerank(query: string, candidates: DocChunk[], k: number, modelId: string): Promise<DocChunk[] | null> {
  if (!candidates.length) return candidates;
  if (!(await load(modelId))) return null;
  try {
    const scored = await Promise.all(
      candidates.map(async (c) => {
        const inputs = await tok(query, c.text.slice(0, 1500), { padding: true, truncation: true });
        const out = await model(inputs);
        const logit = out.logits?.data ? out.logits.data[0] : 0;
        return { ...c, score: sigmoid(Number(logit)) };
      })
    );
    return scored.sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, k);
  } catch (e: any) {
    logger.warn('Rerank failed, using vector/BM25 order:', e?.message || e);
    return null;
  }
}

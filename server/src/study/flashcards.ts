import { getContext, generateJSON, type GenRequest } from './_shared.js';
import type { FlashcardSet, Flashcard } from '../types.js';

const SYSTEM = `You are a memory expert. Create HIGH-QUALITY flashcards (question on front, comprehensive answer on back).
Front = a precise, well-formulated question or term. Back = a detailed, complete answer with examples where applicable. Add a hint and 1-3 tags per card.
Cover ALL important concepts thoroughly. Do not repeat cards. Make answers substantive — at least 2-3 sentences each.`;

const SCHEMA = `{
  "title": string,
  "cards": [
    { "front": string, "back": string, "hint": string, "tags": string[] }
  ]
}`;

function normalize(set: any, count: number): FlashcardSet {
  if (!set || typeof set !== 'object') {
    return { title: 'Flashcards', cards: [] };
  }
  
  const cards: Flashcard[] = Array.isArray(set?.cards)
    ? set.cards.slice(0, 60)
        .filter((c: any) => c && typeof c === 'object')
        .map((c: any) => ({
          front: String(c?.front || 'Question'),
          back: String(c?.back || 'Answer'),
          hint: c?.hint ? String(c.hint) : undefined,
          tags: Array.isArray(c?.tags) ? c.tags.map(String) : undefined
        }))
    : [];
  return { title: String(set?.title || 'Flashcards'), cards };
}

export async function generateFlashcards(req: GenRequest, count = 12): Promise<FlashcardSet> {
  const ctx = await getContext(req.source);
  let set: any;
  try {
    set = await generateJSON(
      SYSTEM,
      `Create ${count} flashcards from this material:\n\n${ctx}`,
      req,
      SCHEMA
    );
  } catch (e) {
    return { title: 'Flashcards', cards: [] };
  }
  return normalize(set, count);
}

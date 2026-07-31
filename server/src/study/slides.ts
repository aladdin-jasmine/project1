import { getContext, generateJSON, type GenRequest } from './_shared.js';
import type { SlideDeck, Slide } from '../types.js';

const SYSTEM = `You are an expert instructional designer. Turn study material into a detailed, polished slide deck.
Rules: each slide has a clear title, 4-6 detailed bullet points (informative, substantive), and comprehensive speaker notes that deeply explain each bullet point.
Vary layouts. Cover ALL important concepts thoroughly. Do not invent facts not present in the material.
Make each slide substantive — bullet points should be explanatory, not just keywords. Speaker notes should be 3-5 sentences each.`;

const SCHEMA = `{
  "title": string,
  "subtitle": string,
  "slides": [
    { "title": string, "bullets": string[], "notes": string, "layout": "title"|"bullets"|"two-col"|"quote" }
  ]
}`;

function normalize(deck: any): SlideDeck {
  if (!deck || typeof deck !== 'object') {
    return { title: 'Study Deck', subtitle: '', slides: [] };
  }
  
  const slides: Slide[] = Array.isArray(deck?.slides)
    ? deck.slides.slice(0, 40)
        .filter((s: any) => s && typeof s === 'object')
        .map((s: any) => ({
          title: String(s?.title || 'Untitled'),
          bullets: Array.isArray(s?.bullets) ? s.bullets.map(String) : [],
          notes: String(s?.notes || ''),
          layout: (['title', 'two-col', 'quote', 'bullets'].includes(s?.layout) ? s.layout : 'bullets') as any
        }))
    : [];
  return { title: String(deck?.title || 'Study Deck'), subtitle: String(deck?.subtitle || ''), slides };
}

export async function generateSlides(req: GenRequest, count = 8): Promise<SlideDeck> {
  const ctx = await getContext(req.source);
  let deck: any;
  try {
    deck = await generateJSON(
      SYSTEM,
      `Create a ${count}-slide presentation based on this material:\n\n${ctx}`,
      req,
      SCHEMA
    );
  } catch (e) {
    return { title: 'Study Deck', subtitle: '', slides: [] };
  }
  return normalize(deck);
}

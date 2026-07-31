import { chatText } from '../llm/client.js';
import type { GenRequest } from './_shared.js';
import type { VisualResult } from '../types.js';

const SCHEMA = `{
  "title": string,
  "mermaid": string,
  "description": string
}`;

// ---------------------------------------------------------------------------
// Mermaid sanitisation
// ---------------------------------------------------------------------------

/**
 * Fix common LLM-generated mermaid syntax errors so the diagram always
 * reaches the renderer in a parseable state.
 *
 * Handles:
 *  - Malformed arrows like "-->|>" (missing closing "|")
 *  - Random trailing non-mermaid characters
 *  - Unescaped special characters inside node labels
 */
function sanitizeMermaid(code: string): string {
  const lines = code.split('\n');

  const cleaned = lines.map((raw) => {
    // Drop pure comment / blank lines untouched (mermaid %% comments are
    // also stripped by the frontend, but keeping them here is harmless).
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('%%')) return raw;

    let line = raw;

    // 1. Fix malformed arrow tokens.
    //    "-->|>" is the most common LLM mistake: a link token whose closing
    //    "|" was dropped, leaving the ">" dangling.  Also catch variants where
    //    the whole token is mangled, e.g. "--->|>".
    line = line
      .replace(/-->+\|>([^|]*)$/gm, (match, label) => `-->|${label}|`)   // "-->|label>"  →  "-->|label|"
      .replace(/-->+\|>([^|]*)/g, (match, label) => `-->|${label}|`)    // mid-line variant
      .replace(/---\|>/g, '-->')                                         // bare broken arrow
      .replace(/-->\|/g, '-->');                                         // stray dangling pipe

    // 2. Fix graph direction line if the model wrote "graph" without TD/LR.
    if (/^graph\s*$/i.test(line.trim())) {
      line = 'graph TD';
    }

    // 3. Unescape ampersands that would break the mermaid parser.
    //    Only unescape the HTML entity form; bare "&" is left for the parser.
    line = line.replace(/&amp;/g, '&');

    // 4. Normalise excessive whitespace within the line.
    line = line.replace(/[^\S\n]{2,}/g, ' ');

    return line;
  });

  const result = cleaned.join('\n').trim();

  // Guard: if the first meaningful token isn't a recognised diagram type,
  // wrap it in a minimal flowchart so the frontend doesn't crash.
  if (!/^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|gitGraph)/i.test(result)) {
    return 'flowchart TD\n  A["' + (result.slice(0, 40).replace(/"/g, "'") || 'Concept') + '"] --> B["See description"]';
  }

  return result;
}

// Generate a Mermaid diagram + step description for visual learning.
export async function generateVisual(topic: string, req: GenRequest): Promise<VisualResult> {
  const out = await chatText({
    projectId: req.projectId,
    providerId: req.providerId,
    model: req.model,
    messages: [
      {
        role: 'system',
        content:
          'You create visual explanations. Produce a valid Mermaid diagram (use "flowchart TD" or "sequenceDiagram") that explains the concept, plus a short description. Return ONLY valid JSON.'
      },
      {
        role: 'user',
        content: `Create a Mermaid diagram explaining "${topic}". ${SCHEMA}`
      }
    ],
    temperature: 0.5,
    maxTokens: 1200
  });

  let t = out.trim();
  const f = t.match(/```(?:json|mermaid)?\s*([\s\S]*?)```/i);
  if (f) t = f[1].trim();
  const s = t.indexOf('{');
  const e = t.lastIndexOf('}');
  if (s !== -1 && e !== -1) t = t.slice(s, e + 1);

  let p: any;
  try {
    p = JSON.parse(t);
  } catch (err) {
    // Fallback structure
    return {
      title: topic || 'Visual',
      mermaid: 'flowchart TD\n  A["' + (topic || 'Concept') + '"] --> B["Concept Details"]',
      description: 'Unable to generate detailed diagram'
    };
  }

  if (!p || typeof p !== 'object') {
    p = {};
  }

  let mermaid = String(p.mermaid || '');
  // Pull mermaid out of a fenced block if present
  const mf = mermaid.match(/```(?:mermaid)?\s*([\s\S]*?)```/i);
  if (mf) mermaid = mf[1].trim();

  // Run the full sanitisation pipeline
  mermaid = sanitizeMermaid(mermaid);

  return {
    title: String(p.title || topic),
    mermaid,
    description: String(p.description || '')
  };
}

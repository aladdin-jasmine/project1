import {
  getContext, generateJSON, parseJSON, poolCompletion,
  type CompletionFn, type GenRequest
} from './_shared.js';
import { createPool, mapPool } from '../llm/lanes.js';
import { planBlueprint, normalizeBlueprint, specFor, type UnitSpec } from './blueprint.js';
import type {
  NotesPack, FiveMarkQA, TenMarkQA, BlueprintUnit, ContentBlueprint
} from '../types.js';
import {
  validateNotes5Mark,
  validateNotes10Mark,
  validateExamNotes,
  validateShortNotes,
  validateOnePage,
  validateVivaQuestions,
  logValidation,
  countWords,
  type ValidationResult
} from './_validation.js';
import { logger } from '../util/logger.js';

// Convert model-supplied value to markdown text, handling objects, arrays, strings
function toMarkdown(value: any): string {
  if (typeof value === 'string') return value.trim();
  if (!value && value !== '') return '';
  if (Array.isArray(value)) {
    return value.map((v: any) => toMarkdown(v)).filter(Boolean).join('\n\n');
  }
  if (typeof value === 'object') {
    const primary = value.answer ?? value.body ?? value.card ?? value.expectedAnswer ?? value.text ?? value.content ?? '';
    const primaryStr = toMarkdown(primary);
    if (primaryStr && primaryStr.trim()) return primaryStr;
    const fallback = Object.entries(value)
      .filter(([k, v]) => k !== 'id' && v != null && v !== '' && String(v).trim())
      .map(([k, v]) => `**${k}**: ${toMarkdown(v)}`)
      .join('\n');
    return fallback;
  }
  const s = String(value).trim();
  return s || '';
}

function strArr(val: any, limit = 12): string[] {
  if (!val) return [];
  const arr = Array.isArray(val) ? val : [val];
  return arr.map((v: any) => toMarkdown(v)).filter(Boolean).slice(0, limit);
}

export type NoteType = 'short-notes' | 'exam-notes' | '5-mark' | '10-mark' | 'one-page' | 'viva-questions';

const NOTE_TYPES: NoteType[] = ['short-notes', 'exam-notes', '5-mark', '10-mark', 'one-page', 'viva-questions'];

// ---------------------------------------------------------------------------
// Per-unit writers
// ---------------------------------------------------------------------------

/**
 * Each note type writes one blueprint unit (or a small group of them) per API
 * call. Because the blueprint already fixed *what* every unit covers, calls are
 * fully independent and run concurrently on separate provider/key/model lanes.
 * A call also gets the entire output budget for its own unit, which is what
 * stops long answers being cut off mid-JSON.
 */
interface UnitWriter {
  schema: string;
  system(topic: string, spec: UnitSpec, units: BlueprintUnit[]): string;
  /** Raw JSON → one entry per unit, in blueprint order where possible. */
  extract(json: any, units: BlueprintUnit[]): any[];
  /** The text whose length decides whether the unit needs expanding. */
  bodyOf(item: any): string;
  /** Put an expanded body back on the item. */
  withBody(item: any, body: string): any;
}

const STRUCTURE_5MARK = `**1. DEFINITION** (60-80 words) — precise definition, scope, why it matters.
**2. EXPLANATION** (200-250 words) — 3-4 sub-headed subtopics, 50-70 words each, with technical terms and examples woven in.
**3. WORKED EXAMPLE** (60-80 words) — one concrete worked example with steps.
**4. KEY TAKEAWAYS** (50-70 words) — 5-6 bullets an examiner rewards.`;

const STRUCTURE_10MARK = `**1. INTRODUCTION** (120-150 words) — context, scope, and roadmap of what will be covered.
**2. MAIN BODY** (450-550 words) — 4-6 sub-headed subtopics with technical depth, one worked example with concrete figures, and at least one diagram description.
**3. KEY POINTS** (120-150 words) — 8-10 bullets including common exam mistakes and examiner tips.
**4. CONCLUSION** (100-130 words) — synthesis, broader context, and implications.
**5. MARKING SCHEME** — how marks break down across sections (e.g., "Intro: 2 marks, Body: 5 marks, Conclusion: 2 marks, Key points: 1 mark").`;

function unitBrief(units: BlueprintUnit[], spec: UnitSpec): string {
  return units
    .map(
      (u, i) => `${units.length > 1 ? `${spec.unitLabel.toUpperCase()} ${i + 1}` : 'ASSIGNMENT'} (id: "${u.id}")
  ${spec.titleKind === 'question' ? 'Question' : 'Heading'}: ${u.title}
  Must cover: ${u.focus}${u.subtopics.length ? `\n  Subtopics: ${u.subtopics.join('; ')}` : ''}
  Length: about ${u.targetWords} words (never fewer than ${Math.round(u.targetWords * 0.85)})
  Diagram required: ${u.needsDiagram ? 'yes' : 'optional'} · Worked examples: ${u.exampleCount}`
    )
    .join('\n\n');
}

const WRITERS: Record<NoteType, UnitWriter> = {
  '5-mark': {
    // "answer" comes first deliberately: if the reply is cut off at the output
    // cap, repairTruncatedJSON salvages the fragment, and a partial answer is
    // far more valuable than a complete list of key points with no answer.
    schema: `{ "items": [{ "id": string, "question": string, "answer": string, "subtopics": string[], "examples": string[], "keyPoints": string[] }] }`,
    system: (topic, spec, units) => `You are an expert examiner writing concise, exam-perfect 5-mark answers on "${topic}".

Write the answer(s) assigned below. Do not invent extra questions and do not change the assigned question wording.

${unitBrief(units, spec)}

ANSWER STRUCTURE — every answer follows this exactly:
${STRUCTURE_5MARK}

RULES:
- "answer" MUST be one concise markdown string containing all sections. Never a nested object.
- Target: ~${units[0].targetWords} words total. Do NOT exceed ${units[0].targetWords + 120} words.
- Use markdown headings and bullets. Be exam-focused, not conversational.
- Fill "subtopics", "examples" and "keyPoints" as well — they are shown separately.
- Echo the assigned "id" on each item so it can be matched back.`,
    extract: (json, units) => alignById(json, units),
    bodyOf: (item) => toMarkdown(item?.answer),
    withBody: (item, body) => ({ ...item, answer: body })
  },

  '10-mark': {
    schema: `{ "items": [{ "id": string, "question": string, "answer": string, "introduction": string, "subtopics": string[], "examples": string[], "keyPoints": string[], "conclusion": string, "markingScheme": string }] }`,
    system: (topic, spec, units) => `You are an expert examiner writing a focused, high-quality 10-mark answer on "${topic}".

Write the answer assigned below. Do not invent extra questions and do not change the assigned question wording.

${unitBrief(units, spec)}

ANSWER STRUCTURE — follow exactly:
${STRUCTURE_10MARK}

RULES:
- "answer" MUST be one complete markdown string containing every section above. Never a nested object.
- Target: ~${units[0].targetWords} words total. Do NOT exceed ${units[0].targetWords + 200} words.
- Use markdown headings and bullets. Be precise and exam-focused.
- Also fill "introduction", "conclusion" and "markingScheme" as separate fields.
- Echo the assigned "id" on each item.`,
    extract: (json, units) => alignById(json, units),
    bodyOf: (item) => toMarkdown(item?.answer),
    withBody: (item, body) => ({ ...item, answer: body })
  },

  'short-notes': {
    schema: `{ "items": [{ "id": string, "card": string }] }`,
    system: (topic, spec, units) => `You are writing quick-revision note cards on "${topic}".

Write one card per assignment below:

${unitBrief(units, spec)}

CARD FORMAT (markdown, one string per card):
- A bold heading naming the aspect
- 3-5 tight bullet points of hard facts, formulas or definitions
- Optionally one short example

Keep each card scannable — a student should absorb it in 20 seconds. Echo the assigned "id".`,
    extract: (json, units) => alignById(json, units),
    bodyOf: (item) => toMarkdown(item?.card),
    withBody: (item, body) => ({ ...item, card: body })
  },

  'exam-notes': {
    schema: `{ "items": [{ "id": string, "heading": string, "body": string, "tips": string[], "diagrams": string[] }] }`,
    system: (topic, spec, units) => `You are writing one section of comprehensive exam preparation notes on "${topic}".

${unitBrief(units, spec)}

REQUIREMENTS:
- "body": detailed markdown for this section only — definitions, formulas, explanations, worked detail, bullet lists and tables where they help. Do not write an introduction to the whole topic; write only this section.
- "tips": 1-3 exam shortcuts, mnemonics or quick-recall strategies relevant to this section.
- "diagrams": a \`\`\`mermaid block or labelled text diagram when it aids understanding${units[0].needsDiagram ? ' (required for this section)' : ''}.
- Stay strictly on this section's focus — other sections cover the rest.
- Echo the assigned "id".`,
    extract: (json, units) => alignById(json, units),
    bodyOf: (item) => toMarkdown(item?.body),
    withBody: (item, body) => ({ ...item, body })
  },

  'one-page': {
    schema: `{ "items": [{ "id": string, "heading": string, "body": string }] }`,
    system: (topic, spec, units) => `You are writing one section of an ultra-dense one-page revision sheet on "${topic}".

${unitBrief(units, spec)}

REQUIREMENTS:
- STRICT HARD LIMIT: the ENTIRE body across ALL sections must be under 5000 characters. Be extremely concise — every character counts.
- Maximum information density: tables, bullet hierarchies, comparison charts, formulas, abbreviations.
- No filler sentences, no restating the question, no "in this section we will", no transitions.
- Every line must carry a fact a student could be examined on.
- Use compact formatting: "Term: Definition" not "The term X means Y".
- Echo the assigned "id".`,
    extract: (json, units) => alignById(json, units),
    bodyOf: (item) => toMarkdown(item?.body),
    withBody: (item, body) => ({ ...item, body })
  },

  'viva-questions': {
    schema: `{ "items": [{ "id": string, "question": string, "expectedAnswer": string }] }`,
    system: (topic, spec, units) => `You are an examiner preparing oral (viva) questions on "${topic}".

Write the assigned question(s) and the answer you would expect to hear:

${unitBrief(units, spec)}

REQUIREMENTS:
- Questions probe WHY / HOW / COMPARE / EVALUATE — never single-word recall.
- "expectedAnswer": ${units[0].targetWords} words covering the direct answer, the reasoning, a concrete example, and the specific points the examiner is listening for.
- Echo the assigned "id".`,
    extract: (json, units) => alignById(json, units),
    bodyOf: (item) => toMarkdown(item?.expectedAnswer),
    withBody: (item, body) => ({ ...item, expectedAnswer: body })
  }
};

const ITEM_KEYS = ['items', 'questions', 'sections', 'cards', 'answers', 'fiveMark', 'tenMark', 'viva', 'notes'];
const ITEM_FIELDS = ['question', 'answer', 'body', 'card', 'expectedAnswer', 'heading'];

/**
 * Find the array of generated items in whatever shape came back. Asking for
 * `{"items": [...]}` is not a guarantee: smaller models variously return a bare
 * array, a differently-named key, or — when only one unit was requested — the
 * single object unwrapped. Treating any of those as "no output" silently drops
 * a question the student paid for.
 */
function collectItems(json: any): any[] {
  if (!json) return [];
  if (Array.isArray(json)) return json.filter((x) => x && typeof x === 'object');

  for (const key of ITEM_KEYS) {
    if (Array.isArray(json[key])) return json[key].filter((x: any) => x && typeof x === 'object');
  }
  // A single unwrapped item.
  if (ITEM_FIELDS.some((f) => json[f] != null)) return [json];
  // Last resort: the only array-valued property that holds objects.
  for (const value of Object.values(json)) {
    if (Array.isArray(value) && value.some((x: any) => x && typeof x === 'object' && ITEM_FIELDS.some((f) => x[f] != null))) {
      return (value as any[]).filter((x) => x && typeof x === 'object');
    }
  }
  return [];
}

/**
 * Match returned items back to their units. Models echo ids reliably most of the
 * time; positional order is the fallback so a missing id never drops content.
 */
function alignById(raw: any, units: BlueprintUnit[]): any[] {
  const items = collectItems(raw);
  if (!items.length) return [];
  if (units.length === 1) return [items[0]];

  const byId = new Map<string, any>();
  for (const it of items) {
    const id = String(it?.id || '').trim();
    if (id && !byId.has(id)) byId.set(id, it);
  }

  const leftovers = items.filter((it) => !String(it?.id || '').trim() || !units.some((u) => u.id === it.id));
  return units.map((u) => byId.get(u.id) ?? leftovers.shift() ?? null).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += Math.max(1, size)) out.push(items.slice(i, i + Math.max(1, size)));
  return out;
}

/** Output cap for one call: enough for its units plus JSON and prose overhead. */
function budgetFor(units: BlueprintUnit[]): number {
  const words = units.reduce((n, u) => n + u.targetWords, 0);
  // ~1.6 tokens per word, then headroom for markdown/JSON structure, the
  // auxiliary fields (subtopics, diagrams, examples) that sit alongside the main
  // body, and models that overshoot the requested length.
  return Math.min(16000, Math.max(2400, Math.round(words * 4.2) + 1200));
}

function contextBlock(ctx: string, limit = 9000): string {
  const trimmed = (ctx || '').trim();
  if (!trimmed) return '';
  return `\n\nSOURCE MATERIAL (your primary reference — prefer it over general knowledge, but never answer "no information available"; fill gaps from expert knowledge):\n${trimmed.slice(
    0,
    limit
  )}\n`;
}

/**
 * Ask for a longer version of a body that came back short.
 *
 * The prompt and the schema must agree: an earlier version told the model "no
 * JSON structure needed" while parsing the reply as JSON, so every expansion
 * parsed to nothing and overwrote a usable answer with an empty string. The
 * caller therefore also keeps whichever version is longest — expansion can only
 * improve a unit, never shrink it.
 */
async function expandBody(
  complete: CompletionFn,
  req: GenRequest,
  opts: {
    topic: string;
    title: string;
    focus: string;
    current: string;
    minWords: number;
    targetWords: number;
    ctx: string;
    /** Rewriting the whole thing, or writing only the missing part. */
    mode: 'rewrite' | 'continue';
  }
): Promise<string> {
  const have = countWords(opts.current);
  const shortfall = Math.max(120, opts.targetWords - have);
  const budget = budgetFor([{ targetWords: opts.targetWords } as BlueprintUnit]);

  const system =
    opts.mode === 'rewrite'
      ? 'You expand study answers to full exam length. You never summarise, never remove content, and you reply with JSON only.'
      : 'You write the missing depth that an incomplete study answer still needs. You never repeat what is already written, and you reply with JSON only.';

  const head = `Topic: "${opts.topic}"
${opts.title ? `Question / section: ${opts.title}` : ''}
Must cover: ${opts.focus}
${contextBlock(opts.ctx, 5000)}`;

  const user =
    opts.mode === 'rewrite'
      ? `${head}
The current version is only ${have} words; it needs at least ${opts.minWords} (target ${opts.targetWords}).

CURRENT VERSION:
"""
${opts.current || '(empty — write it from scratch)'}
"""

Rewrite it at full length. Keep everything already there, then deepen it: expand each point into full explanation, add the missing subtopics, add worked examples with concrete detail, add a diagram if one helps, and finish every section. Use markdown headings and bullets.

Return ONLY this JSON, with the complete text as a single markdown string:
{ "answer": string }`
      : `${head}
An answer of ${have} words already exists and must NOT be repeated. Write roughly ${shortfall} further words that continue it.

ALREADY WRITTEN (do not repeat any of it):
"""
${opts.current}
"""

Write the depth that is still missing: additional subtopics with sub-headings, worked examples with concrete figures or scenarios, a diagram if one aids understanding, common exam mistakes, and a closing summary. Start directly with a markdown heading — no preamble, no reference to "the above".

Return ONLY this JSON:
{ "answer": string }`;

  const raw = await complete({ system, user, temperature: 0.55, maxTokens: budget });
  const parsed = safeParse(raw);
  // A model that ignored the schema and replied in prose is still usable.
  const produced = toMarkdown(parsed?.answer ?? parsed?.body ?? parsed?.text ?? '') || stripFences(raw);
  if (!produced || !produced.trim()) return opts.current;

  const candidate = opts.mode === 'continue' && opts.current ? `${opts.current}\n\n${produced}` : produced;
  // Only accept the expansion if it meaningfully improves word count.
  // A 1-word bump means the model likely echoed the input.
  const improvement = countWords(candidate) - have;
  return improvement >= Math.max(20, Math.round(opts.targetWords * 0.05)) ? candidate : opts.current;
}

function safeParse(text: string): any {
  // parseJSON tolerates fences and repairs a body cut off at the output cap.
  try {
    return parseJSON(text);
  } catch {
    return null;
  }
}

function stripFences(text: string): string {
  const t = String(text || '').trim();
  const fence = t.match(/```(?:json|markdown)?\s*([\s\S]*?)```/i);
  return (fence ? fence[1] : t).trim();
}

interface UnitResult {
  unit: BlueprintUnit;
  item: any;
}

/** Generate one group of units in a single call, then expand anything short. */
async function writeGroup(
  units: BlueprintUnit[],
  nt: NoteType,
  spec: UnitSpec,
  writer: UnitWriter,
  req: GenRequest,
  ctx: string,
  topic: string,
  complete: CompletionFn
): Promise<UnitResult[]> {
  const system = writer.system(topic, spec, units);
  const user = `Topic: "${topic}"${contextBlock(ctx)}
Write ${units.length === 1 ? 'the assignment' : `all ${units.length} assignments`} described in your instructions, in full, now. Return one array entry per assignment.`;

  const json = await generateJSON(system, user, req, writer.schema, budgetFor(units), complete);
  const items = writer.extract(json, units);

  const out: UnitResult[] = [];
  for (let i = 0; i < units.length; i++) {
    const unit = units[i];
    let item = items[i];
    if (!item) {
      logger.warn(`[Notes] ${nt} unit "${unit.title.slice(0, 50)}" produced no item`);
      continue;
    }

    // Expand short bodies, keeping the best version seen at every step. A first
    // pass rewrites at full length; if the model just restates itself, the
    // second asks only for the missing depth and appends it, which cannot
    // shrink the answer.
    let best = writer.bodyOf(item);
    for (let attempt = 0; attempt < 2 && countWords(best) < spec.minWords; attempt++) {
      const before = countWords(best);
      // First pass rewrites at full length. Only once something exists is
      // "continue" meaningful — asking a model not to repeat an empty answer
      // produces nonsense.
      const mode: 'rewrite' | 'continue' = attempt === 0 || before === 0 ? 'rewrite' : 'continue';
      logger.warn(
        `[Notes] ${nt} "${unit.title.slice(0, 50)}" is ${before}/${spec.minWords} words — ${mode} pass`
      );
      try {
        const expanded = await expandBody(complete, req, {
          topic,
          title: unit.title,
          focus: unit.focus,
          current: best,
          minWords: spec.minWords,
          targetWords: unit.targetWords,
          ctx,
          mode
        });
        if (countWords(expanded) <= before) {
          logger.warn(`[Notes] ${nt} ${mode} pass added nothing — keeping the ${before}-word version`);
          if (mode === 'continue') break;
          continue; // fall through to the append strategy
        }
        best = expanded;
      } catch (err) {
        logger.warn(
          `[Notes] ${nt} expansion failed, keeping ${before}-word version: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
        break;
      }
    }

    if (countWords(best) === 0) {
      logger.warn(
        `[Notes] ${nt} "${unit.title.slice(0, 50)}" produced an empty body — skipping unit`
      );
      continue;
    }

    if (countWords(best) < spec.minWords) {
      logger.warn(
        `[Notes] ${nt} "${unit.title.slice(0, 50)}" finished at ${countWords(best)}/${spec.minWords} words`
      );
    }

    out.push({ unit, item: writer.withBody(item, best) });
  }
  return out;
}

export async function generateNotes(
  req: GenRequest,
  noteType?: NoteType,
  existingQA?: string[],
  blueprintRaw?: any
): Promise<NotesPack> {
  // Notes are the only study feature with a persisted task override today. Carry
  // that identity all the way to the unified LLM client.
  req = { ...req, taskType: 'notes' };
  const nt: NoteType = noteType && NOTE_TYPES.includes(noteType) ? noteType : 'exam-notes';
  const spec = specFor(nt);
  const writer = WRITERS[nt];
  const topic = req.source.value || 'General Study';

  const ctx = await getContext(req.source);
  if (ctx.trim().length < 100) {
    logger.warn(`[Notes] Little or no source material for "${topic}" (${ctx.length} chars) — using model knowledge.`);
  } else {
    logger.info(`[Notes] ${ctx.length} chars of source material for "${topic}"`);
  }

  // Reasoning first: decide every question/section and its shape, then write
  // them concurrently. A blueprint approved by the student in the plan gate is
  // used as-is; otherwise one is produced here.
  const approved = normalizeBlueprint(blueprintRaw, nt);
  const blueprint: ContentBlueprint =
    approved ||
    (await planBlueprint({
      req,
      targetType: nt,
      topic,
      context: ctx,
      existing: existingQA
    }));

  logger.info(
    `[Notes] ${nt}: ${blueprint.units.length} ${spec.unitLabel}(s) planned (~${blueprint.totalWords} words)${
      approved ? ' [approved plan]' : ''
    }`
  );

  const groups = chunk(blueprint.units, spec.perCall);
  const pool = createPool(
    { projectId: req.projectId, providerId: req.providerId, model: req.model, taskType: 'notes' },
    { label: `notes:${nt}`, maxConcurrency: groups.length }
  );
  const complete = poolCompletion(pool);

  const started = Date.now();
  const outcomes = await mapPool(pool, groups, (group) =>
    writeGroup(group, nt, spec, writer, req, ctx, topic, complete)
  );

  const results: UnitResult[] = [];
  const failures: string[] = [];
  for (const o of outcomes) {
    if (o.ok && o.value) results.push(...o.value);
    else failures.push(o.error instanceof Error ? o.error.message : String(o.error));
  }
  for (const f of failures) logger.warn(`[Notes] ${nt} group failed: ${f}`);

  // A group can fail as a whole (bad JSON, every lane exhausted) or drop a single
  // unit the model omitted. Either way the student asked for that question, so
  // retry whatever is still missing one unit per call — a smaller prompt on a
  // fresh lane succeeds far more often than the batch that lost it.
  const done = new Set(results.map((r) => r.unit.id));
  const missing = blueprint.units.filter((u) => !done.has(u.id));
  if (missing.length) {
    logger.warn(`[Notes] ${nt}: retrying ${missing.length} missing ${spec.unitLabel}(s) individually`);
    const retried = await mapPool(pool, missing, (unit) =>
      writeGroup([unit], nt, spec, writer, req, ctx, topic, complete)
    );
    for (const o of retried) {
      if (o.ok && o.value) results.push(...o.value);
      else logger.warn(`[Notes] ${nt} retry failed: ${o.error instanceof Error ? o.error.message : String(o.error)}`);
    }
    // Restore blueprint order so the pack reads as planned.
    const order = new Map(blueprint.units.map((u, i) => [u.id, i]));
    results.sort((a, b) => (order.get(a.unit.id) ?? 0) - (order.get(b.unit.id) ?? 0));
  }

  logger.info(
    `[Notes] ${nt}: ${results.length}/${blueprint.units.length} ${spec.unitLabel}(s) written in ${(
      (Date.now() - started) / 1000
    ).toFixed(1)}s across ${pool.size} lane(s)`
  );

  if (!results.length) {
    throw new Error(
      failures[0] ||
        `Could not generate ${nt} for "${topic}". Check that a provider with a working key is enabled in Settings → Providers.`
    );
  }

  const pack = assemble(nt, topic, results);
  validateAndLogNotes(pack, nt);
  return pack;
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

function emptyPack(title: string): NotesPack {
  return {
    title,
    shortNotes: [],
    examNotes: '',
    quickTips: [],
    diagrams: [],
    fiveMark: [],
    tenMark: [],
    onePage: '',
    viva: [],
    mindmap: { root: 'Topic', nodes: [] }
  };
}

const TITLE_SUFFIX: Record<NoteType, string> = {
  '5-mark': '5-Mark Questions',
  '10-mark': '10-Mark Questions',
  'short-notes': 'Short Notes',
  'exam-notes': 'Exam Notes',
  'one-page': 'One-Page Summary',
  'viva-questions': 'Viva Questions'
};

function assemble(nt: NoteType, topic: string, results: UnitResult[]): NotesPack {
  const pack = emptyPack(`${topic} — ${TITLE_SUFFIX[nt]}`);

  switch (nt) {
    case '5-mark':
      pack.fiveMark = results.map(({ unit, item }): FiveMarkQA => ({
        question: toMarkdown(item.question) || unit.title,
        answer: toMarkdown(item.answer),
        subtopics: strArr(item.subtopics).length ? strArr(item.subtopics) : unit.subtopics,
        diagrams: strArr(item.diagrams),
        examples: strArr(item.examples),
        keyPoints: strArr(item.keyPoints)
      })).filter((qa) => qa.question || qa.answer);
      break;

    case '10-mark':
      pack.tenMark = results.map(({ unit, item }): TenMarkQA => ({
        question: toMarkdown(item.question) || unit.title,
        answer: toMarkdown(item.answer),
        introduction: toMarkdown(item.introduction),
        subtopics: strArr(item.subtopics).length ? strArr(item.subtopics) : unit.subtopics,
        diagrams: strArr(item.diagrams),
        examples: strArr(item.examples),
        keyPoints: strArr(item.keyPoints),
        conclusion: toMarkdown(item.conclusion),
        markingScheme: toMarkdown(item.markingScheme)
      })).filter((qa) => qa.question || qa.answer);
      break;

    case 'short-notes':
      pack.shortNotes = results.map(({ item }) => toMarkdown(item.card)).filter(Boolean);
      break;

    case 'exam-notes': {
      pack.examNotes = sanitizeMermaidBlocks(results
        .map(({ unit, item }) => {
          const heading = toMarkdown(item.heading) || unit.title;
          const body = toMarkdown(item.body);
          return body ? `## ${heading}\n\n${body}` : '';
        })
        .filter(Boolean)
        .join('\n\n'));
      pack.quickTips = dedupe(results.flatMap(({ item }) => strArr(item.tips, 4)));
      pack.diagrams = dedupe(results.flatMap(({ item }) => strArr(item.diagrams, 3)));
      break;
    }

    case 'one-page':
      pack.onePage = results
        .map(({ unit, item }) => {
          const heading = toMarkdown(item.heading) || unit.title;
          const body = toMarkdown(item.body);
          return body ? `## ${heading}\n\n${body}` : '';
        })
        .filter(Boolean)
        .join('\n\n');
      break;

    case 'viva-questions':
      pack.viva = results
        .map(({ unit, item }) => {
          const q = toMarkdown(item.question) || unit.title;
          const a = toMarkdown(item.expectedAnswer);
          return q && a ? `**Q:** ${q}\n\n**A:** ${a}` : q || a || '';
        })
        .filter(Boolean);
      break;
  }

  return pack;
}

function sanitizeMermaidBlocks(body: string): string {
  return body.replace(/```mermaid\n([\s\S]*?)```/gi, (_match, code) => {
    const cleaned = code
      .replace(/-->+\|>([^|]*)/g, (m, label) => `-->|${label}|`)
      .replace(/---\|>/g, '-->')
      .replace(/-->\|/g, '-->')
      .replace(/&amp;/g, '&')
      .trim();
    if (!cleaned) return '';
    if (!/^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|gitGraph)/i.test(cleaned)) {
      return '```mermaid\nflowchart TD\n  A["' + cleaned.slice(0, 30).replace(/"/g, "'") + '"] --> B["Step"]\n```';
    }
    return '```mermaid\n' + cleaned + '\n```';
  });
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((s) => {
    const k = s.trim().toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Validate generated notes and log results
 */
function validateAndLogNotes(pack: NotesPack, noteType: NoteType): void {
  const validations: ValidationResult[] = [];

  switch (noteType) {
    case 'short-notes':
      validations.push(validateShortNotes({ shortNotes: pack.shortNotes }));
      break;

    case 'exam-notes':
      validations.push(validateExamNotes({ examNotes: pack.examNotes, quickTips: pack.quickTips, diagrams: pack.diagrams }));
      break;

    case '5-mark':
      pack.fiveMark.forEach((qa, i) => {
        const result = validateNotes5Mark(qa);
        result.errors = result.errors.map(e => `Question ${i + 1}: ${e}`);
        result.warnings = result.warnings.map(w => `Question ${i + 1}: ${w}`);
        validations.push(result);
      });
      break;

    case '10-mark':
      pack.tenMark.forEach((qa, i) => {
        const result = validateNotes10Mark(qa);
        result.errors = result.errors.map(e => `Question ${i + 1}: ${e}`);
        result.warnings = result.warnings.map(w => `Question ${i + 1}: ${w}`);
        validations.push(result);
      });
      break;

    case 'one-page':
      validations.push(validateOnePage({ onePage: pack.onePage }));
      break;

    case 'viva-questions': {
      // Convert string array back to object format for validation
      const vivaObjects = pack.viva.map(v => {
        if (typeof v === 'string') {
          const parts = v.split('\n\n**A:**');
          return {
            question: parts[0]?.replace('**Q:**', '').trim() || '',
            expectedAnswer: parts[1]?.trim() || ''
          };
        }
        return v as any;
      });
      validations.push(validateVivaQuestions({ viva: vivaObjects }));
      break;
    }
  }

  const allErrors: string[] = [];
  const allWarnings: string[] = [];

  validations.forEach(v => {
    allErrors.push(...v.errors);
    allWarnings.push(...v.warnings);
  });

  logValidation(`Notes(${noteType})`, {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
    metrics: validations[0]?.metrics
  });

  if (allErrors.length > 0) {
    logger.warn(`Notes validation issues for ${noteType}:`, allErrors);
  } else if (allWarnings.length > 0) {
    logger.warn(`Notes validation passed with warnings for ${noteType}:`, allWarnings);
  } else {
    logger.info(`Notes validation passed for ${noteType}`);
  }
}

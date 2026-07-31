import { chatText } from '../llm/client.js';
import { parseJSON, type GenRequest } from './_shared.js';
import { logger } from '../util/logger.js';
import type { ContentBlueprint, BlueprintUnit } from '../types.js';

/**
 * The reasoning stage decides *what* to write before any of it is written: the
 * exact questions or sections, how long each must be, and whether it needs a
 * diagram or worked examples. Two things fall out of that:
 *
 *  - Repetition is impossible, because every unit is chosen against the others
 *    up front instead of a later call being told "don't repeat these".
 *  - The units are independent, so they can be generated concurrently — one
 *    unit per API key/model lane — instead of in a serial batch loop.
 */

export interface UnitSpec {
  /** Human label for one unit of output. */
  unitLabel: string;
  /** How many units to plan by default. */
  count: number;
  /** Words each unit should aim for. */
  targetWords: number;
  /** Below this a unit is considered incomplete and gets an expansion pass. */
  minWords: number;
  /** Units per API call — long-form answers get a call each. */
  perCall: number;
  needsDiagram: boolean;
  exampleCount: number;
  keyPointCount: number;
  /** What the planner should produce as a unit title. */
  titleKind: 'question' | 'section' | 'card';
}

export const UNIT_SPECS: Record<string, UnitSpec> = {
  '5-mark': {
    unitLabel: 'question', count: 2, targetWords: 480, minWords: 400, perCall: 1,
    needsDiagram: false, exampleCount: 2, keyPointCount: 5, titleKind: 'question'
  },
  '10-mark': {
    unitLabel: 'question', count: 1, targetWords: 1000, minWords: 800, perCall: 1,
    needsDiagram: true, exampleCount: 3, keyPointCount: 8, titleKind: 'question'
  },
  'short-notes': {
    unitLabel: 'card', count: 4, targetWords: 120, minWords: 50, perCall: 1,
    needsDiagram: false, exampleCount: 1, keyPointCount: 4, titleKind: 'card'
  },
  'exam-notes': {
    unitLabel: 'section', count: 6, targetWords: 180, minWords: 120, perCall: 1,
    needsDiagram: true, exampleCount: 2, keyPointCount: 5, titleKind: 'section'
  },
  'one-page': {
    unitLabel: 'section', count: 6, targetWords: 150, minWords: 100, perCall: 1,
    needsDiagram: false, exampleCount: 1, keyPointCount: 4, titleKind: 'section'
  },
  'viva-questions': {
    unitLabel: 'question', count: 8, targetWords: 110, minWords: 80, perCall: 1,
    needsDiagram: false, exampleCount: 1, keyPointCount: 3, titleKind: 'question'
  }
};

const GENERIC_SPEC: UnitSpec = {
  unitLabel: 'section', count: 2, targetWords: 150, minWords: 70, perCall: 1,
  needsDiagram: false, exampleCount: 1, keyPointCount: 4, titleKind: 'section'
};

export function specFor(targetType: string): UnitSpec {
  return UNIT_SPECS[targetType] || GENERIC_SPEC;
}

/** Default section skeletons used when the planner is unavailable. */
const FALLBACK_SECTIONS: Record<string, string[]> = {
  'exam-notes': [
    'Overview and scope', 'Core concepts and definitions', 'Formulas, laws and rules',
    'Worked mechanisms and processes', 'Applications and case examples',
    'Common exam traps and mistakes', 'Quick recall tips and mnemonics'
  ],
  'one-page': [
    'Overview', 'Key definitions', 'Core concepts', 'Formulas and equations',
    'Quick facts', 'Common pitfalls', 'Recall tips'
  ],
  'short-notes': [
    'Definition and core idea', 'Types and classification', 'Key components',
    'How it works', 'Advantages', 'Limitations', 'Real-world applications'
  ]
};

function slug(i: number): string {
  return `u${i + 1}`;
}

/** Build units without the model — used as a fallback and for "generate more". */
export function fallbackUnits(targetType: string, topic: string, count?: number): BlueprintUnit[] {
  const spec = specFor(targetType);
  const n = count ?? spec.count;
  const sections = FALLBACK_SECTIONS[targetType];

  return Array.from({ length: n }, (_, i) => {
    const angle = sections?.[i % sections.length];
    const title =
      spec.titleKind === 'question'
        ? angle
          ? `Explain ${angle.toLowerCase()} of ${topic}.`
          : `Discuss an important aspect of ${topic} (aspect ${i + 1}).`
        : angle || `${topic} — part ${i + 1}`;
    return {
      id: slug(i),
      title,
      focus: angle ? `${angle} of ${topic}` : `A distinct aspect of ${topic} not covered by the other units`,
      targetWords: spec.targetWords,
      needsDiagram: spec.needsDiagram && i % 2 === 0,
      exampleCount: spec.exampleCount,
      subtopics: [],
      keyPointCount: spec.keyPointCount
    };
  });
}

const PLAN_SCHEMA = `{
  "approach": string,
  "units": [{
    "title": string,
    "focus": string,
    "subtopics": string[],
    "needsDiagram": boolean,
    "exampleCount": number
  }]
}`;

export interface PlanBlueprintOpts {
  req: GenRequest;
  targetType: string;
  topic: string;
  context?: string;
  /** Titles that already exist and must not be repeated. */
  existing?: string[];
  /** Free-text steer from the student; triggers a re-plan of a prior blueprint. */
  suggestion?: string;
  prior?: ContentBlueprint;
  count?: number;
}

/**
 * One cheap call that lays out the whole pack. Never throws: a planner outage
 * degrades to the deterministic skeleton rather than blocking generation.
 */
export async function planBlueprint(opts: PlanBlueprintOpts): Promise<ContentBlueprint> {
  const { req, targetType, topic } = opts;
  const spec = specFor(targetType);
  const count = Math.max(1, Math.min(opts.count ?? spec.count, 30));

  const existingBlock = opts.existing?.length
    ? `\n\nALREADY COVERED — every new ${spec.unitLabel} must explore something different:\n${opts.existing
        .map((q, i) => `  ${i + 1}. ${q}`)
        .join('\n')}`
    : '';

  const priorBlock = opts.prior?.units?.length
    ? `\n\nYOUR PREVIOUS PLAN:\n${opts.prior.units
        .map((u, i) => `  ${i + 1}. ${u.title} — ${u.focus}`)
        .join('\n')}`
    : '';

  const suggestionBlock = opts.suggestion?.trim()
    ? `\n\nSTUDENT'S INSTRUCTION — this overrides your previous plan wherever they conflict:\n"${opts.suggestion.trim()}"\nRevise the plan to follow it exactly.`
    : '';

  const contextBlock = opts.context?.trim()
    ? `\n\nSOURCE MATERIAL AVAILABLE (plan around what is actually covered here):\n${opts.context.slice(0, 6000)}`
    : '\n\nNo source documents are available — plan from expert knowledge of the topic.';

  const system = `You are StudyForge's planning agent. You decide the structure of study material BEFORE it is written.

Plan EXACTLY ${count} ${spec.unitLabel}(s) for "${topic}" (${targetType}).

Rules:
- Every ${spec.unitLabel} must cover a COMPLETELY DIFFERENT aspect. No overlap, no paraphrases of each other.
- Order them so a student reading top to bottom builds understanding progressively.
- "title": ${
    spec.titleKind === 'question'
      ? `a full exam question, phrased as an examiner would ask it`
      : `a short, concrete heading (3-7 words)`
  }.
- "focus": one sentence naming precisely what that ${spec.unitLabel} must explain, so a writer needs no further context.
- "subtopics": 3-5 sub-headings the writer must cover inside it.
- "needsDiagram": true only where a diagram genuinely aids understanding (flow, architecture, comparison, lifecycle).
- "exampleCount": how many concrete worked examples it needs (0-5).

Each ${spec.unitLabel} will be written to about ${spec.targetWords} words, so scope them accordingly.
Return ONLY valid JSON matching:
${PLAN_SCHEMA}`;

  const user = `Topic: "${topic}"
Deliverable: ${targetType} — ${count} ${spec.unitLabel}(s), ~${spec.targetWords} words each (~${
    count * spec.targetWords
  } words total).${contextBlock}${existingBlock}${priorBlock}${suggestionBlock}

Produce the plan now.`;

  try {
    const raw = await chatText({
      projectId: req.projectId,
      providerId: req.providerId,
      model: req.model,
      taskType: req.taskType,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      temperature: 0.4,
      maxTokens: 2400
    });

    const parsed = parseJSON(raw);
    const units = normalizeUnits(parsed?.units, spec, count);
    if (!units.length) throw new Error('planner returned no units');

    return {
      targetType,
      unitLabel: spec.unitLabel,
      totalWords: units.reduce((n, u) => n + u.targetWords, 0),
      approach: String(parsed?.approach || `Writing ${units.length} ${spec.unitLabel}(s) on distinct aspects of ${topic}.`),
      units,
      generatedAt: new Date().toISOString(),
      fromModel: true
    };
  } catch (err) {
    logger.warn(
      `[Blueprint] planning failed for ${targetType} — using default structure: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    const units = fallbackUnits(targetType, topic, count);
    return {
      targetType,
      unitLabel: spec.unitLabel,
      totalWords: units.reduce((n, u) => n + u.targetWords, 0),
      approach: `Standard ${targetType} structure covering ${units.length} distinct aspects of ${topic}.`,
      units,
      generatedAt: new Date().toISOString(),
      fromModel: false
    };
  }
}

function normalizeUnits(raw: any, spec: UnitSpec, count: number): BlueprintUnit[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const units: BlueprintUnit[] = [];

  for (const item of raw) {
    const title = String(item?.title || '').trim();
    if (!title) continue;
    const dedupe = title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);

    units.push({
      id: slug(units.length),
      title,
      focus: String(item?.focus || title).trim(),
      targetWords: spec.targetWords,
      needsDiagram: item?.needsDiagram === undefined ? spec.needsDiagram : !!item.needsDiagram,
      exampleCount: clampInt(item?.exampleCount, 0, 6, spec.exampleCount),
      subtopics: Array.isArray(item?.subtopics)
        ? item.subtopics.map((s: any) => String(s || '').trim()).filter(Boolean).slice(0, 6)
        : [],
      keyPointCount: spec.keyPointCount
    });
    if (units.length >= count) break;
  }
  return units;
}

function clampInt(value: any, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

/** Restore a blueprint that round-tripped through the client. */
export function normalizeBlueprint(raw: any, targetType: string): ContentBlueprint | undefined {
  if (!raw || !Array.isArray(raw.units) || !raw.units.length) return undefined;
  const spec = specFor(targetType);
  const units = normalizeUnits(raw.units, spec, Math.min(raw.units.length, 30));
  if (!units.length) return undefined;
  return {
    targetType,
    unitLabel: String(raw.unitLabel || spec.unitLabel),
    totalWords: units.reduce((n, u) => n + u.targetWords, 0),
    approach: String(raw.approach || ''),
    units,
    generatedAt: String(raw.generatedAt || new Date().toISOString()),
    fromModel: raw.fromModel !== false
  };
}

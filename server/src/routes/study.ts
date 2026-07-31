import { Router } from 'express';
import { generateSlides } from '../study/slides.js';
import { generateFlashcards } from '../study/flashcards.js';
import { generateQuiz, type QuizType, type Difficulty } from '../study/quiz.js';
import { generateMindMap } from '../study/mindmap.js';
import { generateStudyPlan } from '../study/studyplan.js';
import { generateNotes, type NoteType } from '../study/notes.js';
import { generateVisual } from '../study/visual.js';
import { predictNext } from '../study/predict.js';
import { recommend } from '../study/recommend.js';
import { weakSpotReport } from '../study/weakspot.js';
import { knowledgeGraph } from '../study/graph.js';
import { chatText } from '../llm/client.js';
import { parseJSON, getContext } from '../study/_shared.js';
import { planBlueprint, normalizeBlueprint, fallbackUnits, specFor } from '../study/blueprint.js';
import type { GenRequest, StudySource } from '../study/_shared.js';
import type { ExplainLevel, GenerationPlan, PlanQuestion } from '../types.js';
import { addHistoryItem, updateHistoryItem } from '../db/history.js';
import { logger } from '../util/logger.js';

const router = Router();

// Attach the feature identity before a handler creates its GenRequest. This is
// what lets the LLM client apply the durable per-task model configuration.
const TASK_BY_PATH: Record<string, string> = {
  '/plan': 'agent',
  '/slides': 'slides', '/flashcards': 'flashcards', '/quiz': 'quiz',
  '/mindmap': 'mindmap', '/studyplan': 'studyplan', '/notes': 'notes',
  '/visual': 'visual', '/predict': 'predict',
  '/recommend': 'recommend', '/weakspot': 'recommend', '/graph': 'graph'
};
router.use((req, _res, next) => {
  if (req.body && TASK_BY_PATH[req.path]) req.body._taskType = TASK_BY_PATH[req.path];
  next();
});

// Helper: save to history or update draft if _draftId is provided
function respondWithHistory(req: any, res: any, data: {
  type: string; subType?: string; title: string; content: any;
  metadata?: any; score?: any;
}) {
  // Determine scope based on feature type
  // Notes belong to /notes section, everything else to /studio
  const scope: 'studio' | 'notes' = data.type === 'notes' ? 'notes' : 'studio';

  // Always mark content as ready on successful completion
  const contentWithStatus = { ...data.content, _status: 'ready' };

  if (req.body._draftId) {
    updateHistoryItem(req.body._draftId, {
      title: data.title,
      content: contentWithStatus,
      metadata: { ...data.metadata, scope, status: 'completed' },
      score: data.score
    });
    logger.action('generation.complete', { draftId: req.body._draftId, type: data.type, subType: data.subType, scope });
    res.json({ ...contentWithStatus, _historyId: req.body._draftId });
  } else {
    const histItem = addHistoryItem({
      type: data.type as any,
      subType: data.subType as any,
      title: data.title,
      content: contentWithStatus,
      metadata: { ...data.metadata, scope },
      score: data.score
    });
    logger.action('generation.create', { historyId: histItem.id, type: data.type, subType: data.subType, scope });
    res.json({ ...contentWithStatus, _historyId: histItem.id });
  }
}

function reqFrom(body: any): GenRequest {
  // Support both old and new source formats
  let source: StudySource;
  
  if (body.source && typeof body.source === 'object' && body.source.type) {
    source = body.source;
  } else if (body.text) {
    source = { type: 'text', value: body.text };
  } else if (body.topic) {
    source = { type: 'topic', value: body.topic };
  } else if (body.docId) {
    source = { type: 'doc', docId: body.docId };
  } else {
    source = { type: 'topic', value: body.subject || body.description || '' };
  }
  
  return { 
    projectId: body.projectId, 
    model: body.model, 
    providerId: body.providerId,
    taskType: body._taskType,
    source 
  };
}

// ---------- Planning endpoint (AI reasoning before generation) ----------
const FEATURE_DESCRIPTIONS: Record<string, string> = {
  'slides': 'Generate presentation slides with bullet points and speaker notes',
  'flashcards': 'Create flashcards for active recall practice',
  'quiz': 'Generate quiz questions (MCQ, fill-in, short/long answer)',
  'mindmap': 'Create a visual mind map of topic relationships',
  'studyplan': 'Generate a personalized study plan/schedule',
  'notes': 'Generate structured study notes',
  'visual': 'Create visual diagrams (flowcharts, architecture) using mermaid',
  'graph': 'Build a multi-document knowledge graph',
  'predict': 'Predict likely exam topics based on syllabus',
  'recommendation': 'Get personalized study recommendations',
  'weakspot': 'Analyze weak spots in topic understanding',
  'short-notes': 'Generate concise bullet-point revision notes (2-mark level)',
  'exam-notes': 'Generate comprehensive exam preparation notes',
  '5-mark': 'Generate 5-mark style Q&A pairs',
  '10-mark': 'Generate 10-mark detailed Q&A pairs',
  'one-page': 'Create a single-page ultra-dense revision summary',
  'viva-questions': 'Generate oral exam practice questions with expected answers',
};

router.post('/plan', async (req, res) => {
  try {
    const { prompt, targetType, source, suggestion, priorPlan, unitCount } = req.body;
    if (!prompt?.trim()) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const desc = FEATURE_DESCRIPTIONS[targetType] || 'Generate study content';
    const genReq = reqFrom({ ...req.body, source: source || { type: 'topic', value: prompt } });

    // Retrieve actual context from RAG
    let contextStr = '';
    let docsUsed = 0;
    let contextChars = 0;
    try {
      contextStr = await getContext(genReq.source);
      contextChars = contextStr.length;
      if (genReq.source.type === 'multi' && genReq.source.docIds) {
        docsUsed = genReq.source.docIds.length;
      }
    } catch (e) {
      // Context retrieval failure is not fatal
      logger.warn('Context retrieval failed during planning', { error: e });
    }
    const contextPreview = contextStr.slice(0, 3000);
    const contextFound = contextChars > 100;

    // The blueprint is the part generation actually consumes, so it is produced
    // alongside the narrative plan rather than after it. planBlueprint never
    // throws — it degrades to a deterministic structure — so a planner outage
    // still yields a usable work plan.
    const blueprintPromise = planBlueprint({
      req: genReq,
      targetType: targetType || 'notes',
      topic: prompt.trim(),
      context: contextStr,
      suggestion,
      prior: normalizeBlueprint(priorPlan?.blueprint, targetType || 'notes'),
      count: Number(unitCount) || undefined
    });

    const suggestionBlock = suggestion?.trim()
      ? `\n\nThe student reviewed your previous plan and asked for this change — follow it exactly:\n"${String(
          suggestion
        ).trim()}"`
      : '';

    const metaPromise = chatText({
      projectId: genReq.projectId,
      providerId: genReq.providerId,
      model: genReq.model,
      messages: [
        {
          role: 'system',
          content: `You are StudyForge's planning agent. Analyze what the student needs and create a high-quality plan.

Your response MUST be valid JSON matching EXACTLY this schema:
{
  "understanding": "1-2 sentences on what the student needs",
  "plan": "3-5 sentences on what you will generate and how",
  "topics": ["topic1", "topic2", ...],  // 3-8 key concepts
  "estimatedLength": "e.g. ~500 words or ~12 cards",
  "questions": [
    {
      "id": "q1",
      "question": "question text",
      "kind": "choice|multi|text|boolean",
      "options": ["opt1", "opt2"],  // only for choice/multi
      "default": "defaultValue",     // what "Decide for me" picks
      "why": "one line on why this matters"
    }
  ],
  "qualityNotes": "1-2 sentences on quality approach"
}

CRITICAL: Return AT MOST 3 questions, and ONLY where genuinely ambiguous. For most prompts, return empty questions array.
When kind is:
- "choice": exactly one option must be selected
- "multi": multiple options can be selected
- "text": free input expected
- "boolean": yes/no expected (options should be ["Yes", "No"], default "Yes" or "No")`
        },
        {
          role: 'user',
          content: `Student prompt: "${prompt}"
Target feature: ${targetType} (${desc})

Available knowledge base context (${contextChars} chars):
${contextPreview || '(No documents found in knowledge base — will generate from general knowledge)'}

Analyze the request and generate a clear, high-quality plan.${suggestionBlock}`
        }
      ],
      temperature: 0.3,
      maxTokens: 1000
    });

    // Both reasoning calls run concurrently; the narrative half is optional.
    const [blueprint, metaText] = await Promise.all([
      blueprintPromise,
      metaPromise.catch((err: any) => {
        logger.warn('Plan narrative call failed; using the blueprint alone', { error: err?.message });
        return '';
      })
    ]);

    let planData: any = {};
    if (metaText) {
      try {
        planData = parseJSON(metaText) || {};
      } catch {
        logger.warn('Plan narrative was unparseable; using the blueprint alone');
      }
    }
    // The blueprint is the substantive half of reasoning — it is what generation
    // consumes. A missing narrative only costs prose, so it must not make the
    // caller skip the review gate.
    const reasoningAvailable = blueprint.fromModel;

    // Normalize questions to typed array
    const questions: PlanQuestion[] = Array.isArray(planData.questions)
      ? planData.questions.filter((q: any) => q && q.question).slice(0, 3)
      : [];

    const unitWord = blueprint.units.length === 1 ? blueprint.unitLabel : `${blueprint.unitLabel}s`;
    const plan: GenerationPlan = {
      understanding: planData.understanding || `Generate ${targetType} covering "${prompt.trim()}".`,
      plan: planData.plan || blueprint.approach,
      topics: Array.isArray(planData.topics) && planData.topics.length
        ? planData.topics
        : blueprint.units.map((u) => u.title).slice(0, 8),
      estimatedLength:
        planData.estimatedLength ||
        `${blueprint.units.length} ${unitWord} · ~${blueprint.totalWords} words`,
      questions,
      qualityNotes:
        planData.qualityNotes ||
        `Each ${blueprint.unitLabel} is written by its own request, so none is cut short.`,
      contextFound,
      docsUsed,
      contextChars,
      blueprint,
      suggestion: suggestion?.trim() || undefined
    };

    res.json({ ...plan, reasoningAvailable });
  } catch (e: any) {
    logger.warn('Planning failed, returning fallback', { error: e?.message });
    // Reasoning is unavailable — hand back a deterministic plan so the caller can
    // go straight to generation instead of blocking on a gate with nothing in it.
    const fbTarget = req.body.targetType || 'notes';
    const fbPrompt = (req.body.prompt || 'your topic').trim();
    const spec = specFor(fbTarget);
    const units = fallbackUnits(fbTarget, fbPrompt);
    const plan: GenerationPlan = {
      understanding: `Generate ${fbTarget} based on: "${fbPrompt}"`,
      plan: `The system will retrieve relevant context from your knowledge base and generate ${units.length} ${spec.unitLabel}(s) covering distinct aspects of the topic.`,
      topics: units.map((u) => u.title).slice(0, 8),
      estimatedLength: `${units.length} ${spec.unitLabel}(s) · ~${units.reduce((n, u) => n + u.targetWords, 0)} words`,
      questions: [],
      qualityNotes: 'Using RAG-enhanced generation with your connected knowledge base.',
      contextFound: false,
      docsUsed: 0,
      contextChars: 0,
      blueprint: {
        targetType: fbTarget,
        unitLabel: spec.unitLabel,
        totalWords: units.reduce((n, u) => n + u.targetWords, 0),
        approach: 'Default structure — the planning model was unavailable.',
        units,
        generatedAt: new Date().toISOString(),
        fromModel: false
      }
    };
    res.json({ ...plan, reasoningAvailable: false });
  }
});

router.post('/slides', async (req, res) => {
  try {
    const genReq = reqFrom(req.body);
    const deck = await generateSlides(genReq, req.body.count || 8);
    respondWithHistory(req, res, {
      type: 'slides', subType: 'presentation',
      title: deck.title || 'Presentation Slides',
      content: deck,
      metadata: {
        source: genReq.source, projectId: genReq.projectId,
        providerId: genReq.providerId, model: genReq.model,
        subject: req.body.subject, topic: req.body.topic,
        tags: req.body.tags, slideCount: deck.slides?.length || 0
      }
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/flashcards', async (req, res) => {
  try {
    const genReq = reqFrom(req.body);
    const set = await generateFlashcards(genReq, req.body.count || 12);
    respondWithHistory(req, res, {
      type: 'flashcards', subType: 'general',
      title: set.title || 'Flashcard Set', content: set,
      metadata: {
        source: genReq.source, projectId: genReq.projectId,
        providerId: genReq.providerId, model: genReq.model,
        subject: req.body.subject, topic: req.body.topic,
        tags: req.body.tags, cardCount: set.cards?.length || 0
      }
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/quiz', async (req, res) => {
  try {
    const genReq = reqFrom(req.body);
    const types = Array.isArray(req.body.types) ? (req.body.types as QuizType[]) : undefined;
    const difficulty = (req.body.difficulty as Difficulty) || 'mixed';
    const quiz = await generateQuiz(genReq, { count: req.body.count || 8, types, difficulty });
    let subType: string = 'mixed-quiz';
    if (types && types.length === 1) subType = types[0];
    respondWithHistory(req, res, {
      type: 'quiz', subType: subType as any,
      title: quiz.title || 'Quiz', content: quiz,
      metadata: {
        source: genReq.source, projectId: genReq.projectId,
        providerId: genReq.providerId, model: genReq.model,
        subject: req.body.subject, topic: req.body.topic,
        tags: req.body.tags, difficulty,
        questionCount: quiz.questions?.length || 0
      },
      score: { totalQuestions: quiz.questions?.length || 0, correctAnswers: 0, percentage: 0, attempts: 0 }
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/mindmap', async (req, res) => {
  try {
    const genReq = reqFrom(req.body);
    const map: any = await generateMindMap(genReq);
    respondWithHistory(req, res, {
      type: 'mindmap',
      title: map.title || 'Mind Map', content: map,
      metadata: {
        source: genReq.source, projectId: genReq.projectId,
        providerId: genReq.providerId, model: genReq.model,
        subject: req.body.subject, topic: req.body.topic, tags: req.body.tags
      }
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/studyplan', async (req, res) => {
  try {
    const genReq = reqFrom(req.body);
    const plan: any = await generateStudyPlan(genReq, {
      goal: req.body.goal, durationDays: req.body.durationDays,
      examDate: req.body.examDate, hoursPerDay: req.body.hoursPerDay,
      subjects: req.body.subjects
    });
    respondWithHistory(req, res, {
      type: 'studyplan',
      title: plan.title || 'Study Plan', content: plan,
      metadata: {
        source: genReq.source, projectId: genReq.projectId,
        providerId: genReq.providerId, model: genReq.model,
        subject: req.body.subject, topic: req.body.topic, tags: req.body.tags
      }
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Study generators ----
router.post('/notes', async (req, res) => {
  try {
    const genReq = reqFrom(req.body);
    const noteType: NoteType = req.body.noteType || 'exam-notes';
    const existingQA: string[] = req.body.existingQA || [];
    
    // Validate inputs
    if (!genReq.source?.value && genReq.source?.type === 'topic') {
      return res.status(400).json({ error: 'A topic or prompt is required for notes generation.' });
    }

    let r;
    try {
      // The blueprint the student approved in the plan gate, when there is one.
      // "Generate more" deliberately omits it so fresh units get planned against
      // the questions that already exist.
      const blueprint = existingQA.length > 0 ? undefined : req.body.blueprint;
      r = await generateNotes(genReq, noteType, existingQA, blueprint);
    } catch (genError: any) {
      logger.error('[Notes] generation failed', { error: genError?.message });
      return res.status(500).json({
        error: genError?.message || 'Failed to generate notes. Please try again.',
        details: genError?.message
      });
    }

    // Validate generation result
    if (!r || typeof r !== 'object') {
      console.error('[Notes Generation] Invalid response structure:', r);
      return res.status(500).json({ error: 'Invalid notes format generated. Please try again.' });
    }

    // If existing questions, merge old + new
    const existingContent = req.body._existingContent;
    if (existingContent && existingQA.length > 0) {
      if (noteType === '5-mark' || noteType === '10-mark') {
        const key = noteType === '5-mark' ? 'fiveMark' : 'tenMark';
        const oldItems = existingContent[key] || [];
        const merged = [...oldItems, ...(r as any)[key]];
        (r as any)[key] = merged;
      }
    }

    // Map NoteType to history subType — MUST match the frontend NOTE_TYPES ids exactly
    const subTypeMap: Record<NoteType, string> = {
      'short-notes': 'short-notes', 'exam-notes': 'exam-notes',
      '5-mark': '5-mark', '10-mark': '10-mark',
      'one-page': 'one-page', 'viva-questions': 'viva-questions',
    };

    respondWithHistory(req, res, {
      type: 'notes', subType: subTypeMap[noteType],
      title: r.title || 'Study Notes',
      content: r,
      metadata: {
        source: genReq.source, projectId: genReq.projectId,
        providerId: genReq.providerId, model: genReq.model,
        subject: req.body.subject, topic: req.body.topic, tags: req.body.tags,
        noteType
      }
    });
  } catch (e: any) {
    console.error('[Notes Route Error]', e);
    res.status(500).json({ error: e.message || 'An unexpected error occurred while generating notes.' });
  }
});

router.post('/visual', async (req, res) => {
  try {
    const genReq = reqFrom(req.body);
    const r = await generateVisual(req.body.topic || '', genReq);
    respondWithHistory(req, res, {
      type: 'visual',
      title: `Visual: ${req.body.topic || 'Concept'}`, content: r,
      metadata: {
        source: genReq.source, projectId: genReq.projectId,
        providerId: genReq.providerId, model: genReq.model,
        subject: req.body.subject, topic: req.body.topic, tags: req.body.tags
      }
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/predict', async (req, res) => {
  try {
    const genReq = reqFrom(req.body);
    const r = await predictNext(
      { syllabus: req.body.syllabus || [], examDate: req.body.examDate, pastScores: req.body.pastScores }, genReq
    );
    respondWithHistory(req, res, {
      type: 'prediction',
      title: 'Learning Prediction', content: r,
      metadata: {
        source: genReq.source, projectId: genReq.projectId,
        providerId: genReq.providerId, model: genReq.model,
        subject: req.body.subject, topic: req.body.topic, tags: req.body.tags
      }
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/recommend', async (req, res) => {
  try {
    const genReq = reqFrom(req.body);
    const r = await recommend(genReq);
    respondWithHistory(req, res, {
      type: 'recommendation',
      title: 'Study Recommendations', content: r,
      metadata: {
        source: genReq.source, projectId: genReq.projectId,
        providerId: genReq.providerId, model: genReq.model,
        subject: req.body.subject, topic: req.body.topic, tags: req.body.tags
      }
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/weakspot', async (req, res) => {
  try {
    const genReq = reqFrom(req.body);
    const r = await weakSpotReport(genReq);
    respondWithHistory(req, res, {
      type: 'weakspot',
      title: 'Weak Spot Analysis', content: r,
      metadata: {
        source: genReq.source, projectId: genReq.projectId,
        providerId: genReq.providerId, model: genReq.model,
        subject: req.body.subject, topic: req.body.topic, tags: req.body.tags
      }
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/graph', async (req, res) => {
  try {
    const genReq = reqFrom(req.body);
    const r = await knowledgeGraph(genReq, req.body.topic);
    respondWithHistory(req, res, {
      type: 'graph',
      title: `Knowledge Graph: ${req.body.topic || 'Concepts'}`, content: r,
      metadata: {
        source: genReq.source, projectId: genReq.projectId,
        providerId: genReq.providerId, model: genReq.model,
        subject: req.body.subject, topic: req.body.topic, tags: req.body.tags
      }
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;

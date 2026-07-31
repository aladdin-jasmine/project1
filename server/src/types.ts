// Shared types for StudyForge server

export type ProviderFormat = 'openai' | 'anthropic';

export type ModelCapability = 'text' | 'vision' | 'reasoning' | 'voice-stt' | 'voice-tts' | 'embeddings';

export type TaskType =
  | 'slides' | 'flashcards' | 'quiz' | 'mindmap' | 'studyplan'
  | 'chat' | 'agent' | 'notes'
  | 'visual' | 'graph' | 'recommend' | 'predict'
  | 'voice-stt' | 'voice-tts' | 'embeddings';

export interface ModelInfo {
  id: string;
  name: string;
  capabilities: ModelCapability[];
  contextWindow: number;
  maxTokens: number;
  pricing?: {
    input: number;  // per 1M tokens
    output: number; // per 1M tokens
  };
  enabled: boolean;
  metadata?: {
    speed: 'fast' | 'medium' | 'slow';
    quality: 'high' | 'medium' | 'low';
    vendor?: string;
    description?: string;
  };
}

export interface ProviderKey {
  id: string;
  label: string; // "primary" | "failback-1" ...
  key: string; // secret — masked in API responses
  enabled: boolean;
  cooldownUntil?: number; // epoch ms; key skipped while in cooldown
  requestCount?: number; // track usage for load balancing
  lastUsed?: number; // epoch ms
}

export interface Provider {
  id: string;
  name: string; // e.g. "my-llm-server"
  format: ProviderFormat;
  baseUrl: string; // e.g. https://your-endpoint/v1
  keys: ProviderKey[];
  enabled: boolean;
  models: ModelInfo[]; // Enhanced with capabilities
  defaultModel?: string;
  priority: number; // cross-provider failback order (lower = tried first)
  createdAt: string;
  loadBalancing: {
    enabled: boolean;
    strategy: 'round-robin' | 'least-usage' | 'random' | 'failover-only';
    keyRotation: boolean;
  };
}

export type LearningStyle = 'visual' | 'auditory' | 'reading' | 'kinesthetic' | 'balanced';
export type ExplainLevel = 'Beginner' | 'School' | 'Engineering' | 'Exam' | 'Interview';

export interface TaskModelConfig {
  taskType: TaskType;
  providerId?: string;
  modelId?: string;
  useDefault: boolean;  // If true, use project default
  fallbackToDefault: boolean;
  temperature?: number;
  maxTokens?: number;
}

export interface AdvancedSettings {
  maxRetries: number;
  backoffMs: number;
  backoffFactor: number;
  triggerCodes: number[]; // HTTP codes that trigger failback
  failbackMode: 'key-only' | 'key-then-provider';
  embeddingProviderId?: string;
  embeddingModel: string;
  localEmbeddingFallback: boolean;
  // Retrieval & AI behaviour
  hybridSearch: boolean; // BM25 + vector
  reranker: boolean; // cross-encoder rerank
  rerankerModel: string;
  multiQuery: boolean; // generate sub-queries
  contextCompression: boolean; // summarise long chat history
  compressionTokens: number;
  learningStyle: LearningStyle;
  defaultExplainLevel: ExplainLevel;
  // Dynamic model routing
  dynamicModelSwitch: boolean;
  dynamicModelPool: string[]; // "providerId::modelId" entries
  // Task-specific model configurations
  taskConfigs: Record<TaskType, TaskModelConfig>;
}

export interface Project {
  id: string;
  name: string;
  providerId?: string;
  defaultModel?: string;
  kbId: string;
  memoryEnabled?: boolean; // personalized AI memory (default: true)
  createdAt: string;
  loadBalancing?: {
    enabled: boolean;
    providers: string[];  // Ordered list for failover
  };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChunkMeta {
  page?: number;
  section?: string;
  heading?: string;
  subject?: string;
  chapter?: string;
  book?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  semester?: string;
}

export type Collection = 'kb' | 'qpapers';

export interface DocChunk {
  id: string;
  docId: string;
  text: string;
  embedding?: number[];
  meta: ChunkMeta;
  score?: number;
  collection?: Collection; // which collection it belongs to
}

export interface KnowledgeDoc {
  id: string;
  name: string;
  type: string; // pdf | docx | pptx | txt | md
  size: number;
  chunks: number;
  topics: string[];
  createdAt: string;
  collection: Collection; // 'kb' default, 'qpapers' for question papers
  book?: string;
  chapter?: string;
  subject?: string;
  semester?: string;
  difficulty?: string;
  ocr?: boolean;
  pages?: number;
}

// Chat history
export interface StoredMsg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: any[];
  ts: string;
}
export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: StoredMsg[];
  meta?: Record<string, any>;
}

// Personalized AI memory - Enhanced with learning analytics
export interface MemoryState {
  known: string[]; // concepts the student already understands
  unknown: string[]; // concepts to revisit
  mistakes: { concept: string; detail: string; ts: string }[];
  topicScores: Record<string, { correct: number; incorrect: number; lastAttempt: string; confidence: number }>;
  viewedChunks: Record<string, number>; // chunkId -> view count
  questionsAsked: string[];
  lastUpdate: string;
  // New: Advanced learning tracking
  learningVelocity: Record<string, number>; // topic -> concepts learned per hour
  studySessions: { start: string; end: string; topics: string[]; effectiveness: number }[];
  retentionScores: Record<string, { score: number; lastReview: string; nextReview: string }>; // spaced repetition
  cognitiveLoad: Record<string, number>; // topic -> difficulty experienced (0-1)
  preferredLearningTimes: { hour: number; effectiveness: number }[];
  streakDays: number;
  totalStudyMinutes: number;
  conceptMastery: Record<string, { level: number; evidence: string[]; lastUpdate: string }>; // 0-100
}

export interface ChatRequest {
  projectId?: string;
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  providerId?: string; // override project default
  docIds?: string[]; // restrict RAG retrieval to these docs
  collection?: Collection; // which collection to retrieve from
  sessionId?: string; // chat history session
  learningStyle?: LearningStyle;
  explainLevel?: ExplainLevel;
  useMemory?: boolean; // apply personalized memory
  /** Feature requesting the completion; used to resolve persisted task overrides. */
  taskType?: TaskType;
  /** Set by the provider adapter when the model stopped at the output cap. */
  truncated?: boolean;
}

export interface ChatResult {
  content: string;
  providerId: string;
  model: string;
  keyId: string;
  fromCache?: boolean;
  /** True when the model hit its output limit and the text is incomplete. */
  truncated?: boolean;
}

// Study payloads
export interface SlideDeck {
  title: string;
  subtitle?: string;
  slides: Slide[];
}
export interface Slide {
  title: string;
  bullets: string[];
  notes: string;
  layout: 'title' | 'bullets' | 'two-col' | 'quote';
}

export interface FlashcardSet {
  title: string;
  cards: Flashcard[];
}
export interface Flashcard {
  front: string;
  back: string;
  hint?: string;
  tags?: string[];
}

export interface Quiz {
  title: string;
  questions: QuizQuestion[];
}
export interface QuizQuestion {
  question: string;
  type: 'mcq' | 'fill' | 'short' | 'long' | 'coding';
  options: string[];
  answerIndex: number; // for mcq
  answer?: string; // for fill/short/long/coding
  explanation: string;
  difficulty: 'easy' | 'medium' | 'hard';
  topic?: string;
}

export interface MindMap {
  root: string;
  nodes: MindNode[];
}
export interface MindNode {
  id: string;
  parent: string | null;
  label: string;
  desc?: string;
}

export interface StudyPlan {
  goal: string;
  durationDays: number;
  summary: string;
  examDate?: string;
  subjects?: string[];
  hoursPerDay?: number;
  days: StudyDay[];
}
export interface StudyDay {
  day: number;
  date?: string;
  topics: string[];
  tasks: string[];
  estMinutes: number;
  priority?: string[]; // priority chapters
}

// Automatic notes
export interface FiveMarkQA {
  question: string;
  answer: string;
  subtopics: string[];
  diagrams: string[];
  examples: string[];
  keyPoints: string[];
}

export interface TenMarkQA {
  question: string;
  answer: string;
  introduction: string;
  subtopics: string[];
  diagrams: string[];
  examples: string[];
  keyPoints: string[];
  conclusion: string;
  markingScheme: string;
}

export interface NotesPack {
  title: string;
  shortNotes: string[];
  examNotes: string;
  quickTips: string[];
  diagrams: string[];
  fiveMark: FiveMarkQA[];
  tenMark: TenMarkQA[];
  onePage: string;
  viva: string[];
  mindmap: MindMap;
}

// Agentic planning
export interface PlanQuestion {
  id: string;
  question: string;
  kind: 'choice' | 'multi' | 'text' | 'boolean';
  options?: string[];
  default?: string;
  why?: string;
}

/** One planned piece of output: a question to answer or a section to write. */
export interface BlueprintUnit {
  id: string;
  /** The exam question, or the section/card heading. */
  title: string;
  /** Precisely what this unit must cover, so it can be written in isolation. */
  focus: string;
  targetWords: number;
  needsDiagram: boolean;
  exampleCount: number;
  subtopics: string[];
  keyPointCount: number;
}

/**
 * The output of the reasoning stage: the full shape of the deliverable decided
 * before generation starts. Units are independent, so they are generated in
 * parallel across API keys and models.
 */
export interface ContentBlueprint {
  targetType: string;
  unitLabel: string;
  totalWords: number;
  approach: string;
  units: BlueprintUnit[];
  generatedAt: string;
  /** False when the planner was unreachable and the default structure was used. */
  fromModel: boolean;
}

export interface GenerationPlan {
  understanding: string;
  plan: string;
  topics: string[];
  estimatedLength: string;
  questions: PlanQuestion[];
  qualityNotes: string;
  contextFound?: boolean;
  docsUsed?: number;
  contextChars?: number;
  /** What will actually be generated, unit by unit. */
  blueprint?: ContentBlueprint;
  /** The steer the student gave that produced this revision, if any. */
  suggestion?: string;
}

// Mermaid visual
export interface VisualResult {
  title: string;
  mermaid: string; // mermaid diagram source
  description: string;
}

// Weak-spot detection
export interface WeakSpotReport {
  weakTopics: { topic: string; confidence: number; reason: string }[];
  suggestions: { topic: string; practice: string; revisionPdf?: boolean }[];
}

// Multi-document knowledge graph
export interface KnowledgeGraph {
  nodes: { id: string; label: string; doc: string }[];
  edges: { source: string; target: string; label?: string }[];
}

// Learning analytics - Enhanced with predictive metrics
export interface LearningAnalytics {
  knowledgeScore: number;
  consistencyScore: number;
  revisionScore: number;
  avgQuizScore: number;
  completionPct: number;
  studyHours: number;
  chatUsage: number;
  weakTopics: { topic: string; weakness: number; predictedDifficulty: number; estimatedHours: number }[];
  strongTopics: { topic: string; masteryLevel: number }[];
  weeklyActivity: { date: string; actions: number; effectiveness: number }[];
  knowledgeGrowth: { date: string; score: number; velocity: number }[];
  // New: Advanced analytics
  learningEfficiency: number; // concepts mastered per hour
  retentionRate: number; // % of concepts still remembered after 7 days
  predictionAccuracy: number; // how well our difficulty predictions match reality
  optimalStudyTime: { hour: number; day: string }; // when student learns best
  burnoutRisk: number; // 0-100, based on study patterns
  readinessScore: Record<string, number>; // topic -> exam readiness %
  conceptConnections: { from: string; to: string; strength: number }[]; // knowledge graph
  strugglingConcepts: { concept: string; attempts: number; successRate: number }[];
  masteredConcepts: { concept: string; level: number; lastReviewed: string }[];
}

export interface ApiError {
  error: string;
  detail?: string;
}

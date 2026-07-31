import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

// ---------- Providers ----------
export type ModelCapability = 'text' | 'vision' | 'reasoning' | 'voice-stt' | 'voice-tts' | 'embeddings';

export interface ModelInfo {
  id: string;
  name: string;
  capabilities: ModelCapability[];
  contextWindow: number;
  maxTokens: number;
  pricing?: {
    input: number;
    output: number;
  };
  enabled: boolean;
  metadata?: {
    speed: 'fast' | 'medium' | 'slow';
    quality: 'high' | 'medium' | 'low';
    vendor?: string;
    description?: string;
  };
}

export interface Provider {
  id: string;
  name: string;
  format: 'openai' | 'anthropic';
  baseUrl: string;
  keys: { id: string; label: string; key: string; enabled: boolean; hasKey?: boolean; cooldownUntil?: number }[];
  enabled: boolean;
  models: ModelInfo[];
  defaultModel?: string;
  priority: number;
  createdAt: string;
  loadBalancing?: {
    enabled: boolean;
    strategy: 'round-robin' | 'least-usage' | 'random' | 'failover-only';
    keyRotation: boolean;
  };
}
export interface AdvancedSettings {
  maxRetries: number;
  backoffMs: number;
  backoffFactor: number;
  triggerCodes: number[];
  failbackMode: 'key-only' | 'key-then-provider';
  embeddingProviderId?: string;
  embeddingModel: string;
  localEmbeddingFallback: boolean;
  learningStyle?: string;
  defaultExplainLevel?: string;
  hybridSearch?: boolean;
  reranker?: boolean;
  rerankerModel?: string;
  multiQuery?: boolean;
  contextCompression?: boolean;
  compressionTokens?: number;
  dynamicModelSwitch?: boolean;
  dynamicModelPool?: string[];
  taskConfigs?: Record<string, any>;
}

export interface ExplainResult {
  term: string;
  layers: { level: string; text: string }[];
}

export const providers = {
  list: () => api.get<Provider[]>('/providers').then((r) => r.data),
  get: (id: string, reveal = false) => api.get<Provider>(`/providers/${id}?reveal=${reveal}`).then((r) => r.data),
  create: (body: any) => api.post<Provider>('/providers', body).then((r) => r.data),
  update: (id: string, body: any) => api.put<Provider>(`/providers/${id}`, body).then((r) => r.data),
  remove: (id: string) => api.delete(`/providers/${id}`).then((r) => r.data),
  toggle: (id: string, enabled: boolean) => api.post<Provider>(`/providers/${id}/toggle`, { enabled }).then((r) => r.data),
  test: (id: string) => api.post<{ ok: boolean; model?: string; error?: string }>(`/providers/${id}/test`).then((r) => r.data),
  models: (id: string) => api.post<{ models: ModelInfo[]; provider: Provider }>(`/providers/${id}/models`).then((r) => r.data),
  toggleModel: (providerId: string, modelId: string, enabled: boolean) => 
    api.post<Provider>(`/providers/${providerId}/models/${modelId}/toggle`, { enabled }).then((r) => r.data),
  addModel: (providerId: string, modelId: string) =>
    api.post<Provider>(`/providers/${providerId}/models/add`, { modelId }).then((r) => r.data)
};

export const settings = {
  get: () => api.get<AdvancedSettings>('/settings').then((r) => r.data),
  update: (body: Partial<AdvancedSettings>) => api.put<AdvancedSettings>('/settings', body).then((r) => r.data),
  updateTaskConfig: (taskType: string, config: any) =>
    api.put(`/settings/tasks/${taskType}`, config).then((r) => r.data)
};

// ---------- Projects ----------
export interface Project {
  id: string;
  name: string;
  providerId?: string;
  defaultModel?: string;
  kbId: string;
}
export const projects = {
  list: () => api.get<Project[]>('/projects').then((r) => r.data),
  create: (name: string) => api.post<Project>('/projects', { name }).then((r) => r.data),
  update: (id: string, body: any) => api.put<Project>(`/projects/${id}`, body).then((r) => r.data),
  remove: (id: string) => api.delete(`/projects/${id}`).then((r) => r.data)
};

// ---------- RAG ----------
export type Collection = 'kb' | 'qpapers';
export interface KnowledgeDoc {
  id: string;
  name: string;
  type: string;
  size: number;
  chunks: number;
  topics: string[];
  createdAt: string;
  collection?: Collection;
  book?: string;
  chapter?: string;
  subject?: string;
  semester?: string;
  difficulty?: string;
  ocr?: boolean;
  pages?: number;
}
export interface RagUploadResult {
  results: { name: string; docId: string; chunkCount: number; ocrUsed: boolean }[];
  collection: Collection;
}
export interface StagedFileInfo {
  id: string;
  fileName: string;
  type: string;
  size: number;
  uploadedAt: string;
  metadata: {
    book?: string;
    subject?: string;
    chapter?: string;
    semester?: string;
    difficulty?: string;
    ocr?: boolean;
    collection?: string;
  };
}

export interface FolderNode {
  id: string;
  name: string;
  parentId: string | null;
  docIds: string[];
  children: FolderNode[];
  createdAt: string;
}

export interface FolderPath {
  id: string;
  path: string;
}

export const rag = {
  docs: (collection?: Collection) =>
    api.get<KnowledgeDoc[]>('/rag/docs' + (collection ? `?collection=${collection}` : '')).then((r) => r.data),
  stats: () => api.get('/rag/stats').then((r) => r.data),
  upload: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/rag/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
  },
  uploadMany: (
    files: File[],
    meta: Record<string, any>,
    onProgress?: (name: string, pct: number) => void
  ): Promise<RagUploadResult> => {
    return new Promise((resolve, reject) => {
      const results: RagUploadResult['results'] = [];
      let i = 0;
      const next = () => {
        if (i >= files.length) {
          resolve({ results, collection: (meta.collection as Collection) || 'kb' });
          return;
        }
        const file = files[i];
        const fd = new FormData();
        fd.append('files', file);
        Object.entries(meta).forEach(([k, v]) => {
          if (v !== undefined && v !== null && v !== '') fd.append(k, String(v));
        });
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/rag/upload');
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) onProgress?.(file.name, Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(xhr.responseText);
              if (data?.results) results.push(...data.results);
              i++;
              next();
            } catch {
              i++;
              next();
            }
          } else {
            reject(new Error(`Upload failed for ${file.name} (${xhr.status})`));
          }
        };
        xhr.onerror = () => reject(new Error(`Network error uploading ${file.name}`));
        xhr.send(fd);
      };
      next();
    });
  },
  // Staged upload (upload without processing)
  stageUpload: (
    files: File[],
    meta: Record<string, any>,
    onProgress?: (name: string, pct: number) => void
  ): Promise<{ staged: StagedFileInfo[]; count: number }> => {
    return new Promise((resolve, reject) => {
      let i = 0;
      const allStaged: StagedFileInfo[] = [];
      const next = () => {
        if (i >= files.length) {
          resolve({ staged: allStaged, count: allStaged.length });
          return;
        }
        const file = files[i];
        const fd = new FormData();
        fd.append('files', file);
        Object.entries(meta).forEach(([k, v]) => {
          if (v !== undefined && v !== null && v !== '') fd.append(k, String(v));
        });
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/rag/upload/stage');
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) onProgress?.(file.name, Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(xhr.responseText);
              if (data?.staged) allStaged.push(...data.staged);
              i++;
              next();
            } catch { i++; next(); }
          } else {
            reject(new Error(`Upload failed for ${file.name} (${xhr.status})`));
          }
        };
        xhr.onerror = () => reject(new Error(`Network error uploading ${file.name}`));
        xhr.send(fd);
      };
      next();
    });
  },
  staged: () => api.get<StagedFileInfo[]>('/rag/staged').then((r) => r.data),
  deleteStaged: (id: string) => api.delete(`/rag/staged/${id}`).then((r) => r.data),
  clearStaged: () => api.post('/rag/staged/clear').then((r) => r.data),
  processStaged: (id: string) => api.post(`/rag/process/${id}`).then((r) => r.data),
  processBatchStaged: (ids: string[]) => api.post('/rag/process/batch', { ids }).then((r) => r.data),
  // Chunks
  docChunks: (id: string) => api.get<{ doc: KnowledgeDoc; chunks: any[] }>(`/rag/docs/${id}/chunks`).then((r) => r.data),
  // Folders
  folderTree: () => api.get<FolderNode>('/rag/folders').then((r) => r.data),
  folderPaths: () => api.get<FolderPath[]>('/rag/folders/paths').then((r) => r.data),
  createFolder: (name: string, parentId?: string) => api.post<FolderNode>('/rag/folders', { name, parentId }).then((r) => r.data),
  renameFolder: (id: string, name: string) => api.put<FolderNode>(`/rag/folders/${id}`, { name }).then((r) => r.data),
  deleteFolder: (id: string) => api.delete(`/rag/folders/${id}`).then((r) => r.data),
  moveDoc: (docId: string, toFolderId: string, fromFolderId?: string) => api.put(`/rag/docs/${docId}/move`, { toFolderId, fromFolderId }).then((r) => r.data),
  remove: (id: string) => api.delete(`/rag/docs/${id}`).then((r) => r.data),
  query: (body: { query: string; k?: number; docIds?: string[]; collection?: Collection }) =>
    api.post('/rag/query', body).then((r) => r.data)
};

// ---------- Study ----------
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
  mindmap: { root: string; nodes: { id: string; parent: string; label: string; desc?: string }[] };
}
export interface VisualResult {
  title: string;
  mermaid: string;
  description: string;
}
export interface EvaluateResult {
  question: string;
  studentAnswer: string;
  marks: number;
  maxMarks: number;
  missingConcepts: string[];
  strengths: string[];
  improvements: string[];
  idealAnswer: string;
}
export interface PredictResult {
  nextTopic: string;
  rationale: string;
  plan: string[];
  estimatedHours?: number;
  difficulty?: number;
}
export interface RecommendResult {
  weakTopics: string[];
  suggestions: { type: 'practice' | 'revision' | 'resource' | 'quiz'; text: string }[];
}
export interface WeakSpotResult {
  weakTopics: { topic: string; confidence: number; reason: string }[];
  suggestions: { topic: string; practice: string; revisionPdf: boolean }[];
}
export interface KnowledgeGraph {
  nodes: { id: string; label: string; doc: string }[];
  edges: { source: string; target: string; label?: string }[];
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
  title: string;
  focus: string;
  targetWords: number;
  needsDiagram: boolean;
  exampleCount: number;
  subtopics: string[];
  keyPointCount: number;
}

/** What the reasoning stage decided to generate, before any of it is written. */
export interface ContentBlueprint {
  targetType: string;
  unitLabel: string;
  totalWords: number;
  approach: string;
  units: BlueprintUnit[];
  generatedAt: string;
  /** False when the planner was unreachable and the default structure was used. */
  fromModel?: boolean;
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
  blueprint?: ContentBlueprint;
  suggestion?: string;
  /** False when the planning model was unavailable — callers skip the gate. */
  reasoningAvailable?: boolean;
}

export const study = {
  plan: (body: any) => api.post('/study/plan', body).then((r) => r.data),
  slides: (body: any) => api.post('/study/slides', body).then((r) => r.data),
  flashcards: (body: any) => api.post('/study/flashcards', body).then((r) => r.data),
  quiz: (body: any) => api.post('/study/quiz', body).then((r) => r.data),
  mindmap: (body: any) => api.post('/study/mindmap', body).then((r) => r.data),
  studyplan: (body: any) => api.post('/study/studyplan', body).then((r) => r.data),
  notes: (body: any) => api.post<NotesPack>('/study/notes', body).then((r) => r.data),
  visual: (body: any) => api.post<VisualResult>('/study/visual', body).then((r) => r.data),
  predict: (body: any) => api.post<PredictResult>('/study/predict', body).then((r) => r.data),
  recommend: (body: any) => api.post<RecommendResult>('/study/recommend', body).then((r) => r.data),
  weakspot: (body: any) => api.post<WeakSpotResult>('/study/weakspot', body).then((r) => r.data),
  graph: (body: any) => api.post<KnowledgeGraph>('/study/graph', body).then((r) => r.data)
};

// ---------- Chat ----------
export interface Citation {
  index: number;
  docId: string;
  docName: string;
  snippet: string;
  page?: number;
  heading?: string;
  subject?: string;
  score: number;
}
export interface ChatSession {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
  meta?: Record<string, any>;
}
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  citations?: Citation[];
  ts?: string;
}
export interface ChatSessionFull {
  id: string;
  title: string;
  updatedAt: string;
  messages: ChatMessage[];
}
export const chat = {
  send: (body: any) => api.post('/chat', body).then((r) => r.data),
  sessions: () => api.get<ChatSession[]>('/chat/sessions').then((r) => r.data),
  session: (id: string) => api.get<ChatSessionFull>(`/chat/sessions/${id}`).then((r) => r.data),
  updateSession: (id: string, body: any) => api.patch<ChatSession>(`/chat/sessions/${id}`, body).then((r) => r.data),
  deleteSession: (id: string) => api.delete(`/chat/sessions/${id}`).then((r) => r.data),
  // SSE streaming: returns a promise that resolves when done; calls onToken/onDone
  stream: (body: any, handlers: { onToken: (t: string) => void; onDone: (d: any) => void; onError: (e: string) => void }) => {
    return fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then((res) => {
      if (!res.body) throw new Error('No response stream');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let timedOut = false;

      // If no chunk arrives within this window we surface an error instead of
      // leaving the UI spinner frozen forever.
      const TIMEOUT_MS = 90_000;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;

      const resetTimeout = () => {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          timedOut = true;
          try { reader.cancel(); } catch {}
          handlers.onError('Response timed out — the server took too long. Please try again.');
        }, TIMEOUT_MS);
      };

      resetTimeout();

      const read = () => {
        if (timedOut) return;
        reader.read().then(({ done, value }) => {
          if (timedOut) return;
          if (done) {
            if (timeoutId) clearTimeout(timeoutId);
            return;
          }
          resetTimeout();
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split('\n\n');
          buf = parts.pop() || '';
          for (const part of parts) {
            const line = part.replace(/^data: /, '').trim();
            if (!line) continue;
            try {
              const evt = JSON.parse(line);
              if (evt.token) handlers.onToken(evt.token);
              else if (evt.error) handlers.onError(evt.error);
              else if (evt.done) handlers.onDone(evt);
            } catch {}
          }
          read();
        }).catch((err) => {
          if (timedOut) return;
          handlers.onError(err?.message || 'Stream read error');
        });
      };
      read();
    });
  }
};

// ---------- Voice (server-side Groq STT/TTS with key load-balancing) ----------
export interface VoiceStatus {
  serverVoiceAvailable: boolean;
  providers: { id: string; name: string; baseUrl: string; groq: boolean; activeKeys: number; totalKeys: number }[];
  sttModels: string[];
  ttsModels: string[];
  ttsVoices: string[];
}
export const voice = {
  status: () => api.get<VoiceStatus>('/voice/status').then((r) => r.data),
  stt: (blob: Blob, language?: string) => {
    const fd = new FormData();
    fd.append('audio', blob, 'speech.webm');
    if (language) fd.append('language', language);
    return api
      .post<{ text: string; model: string; providerId: string }>('/voice/stt', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      .then((r) => r.data);
  },
  tts: (text: string, voiceName?: string) =>
    api
      .post('/voice/tts', { text, voice: voiceName }, { responseType: 'blob' })
      .then((r) => r.data as Blob)
};

// ---------- Agentic pipeline (Planner → Retriever → Reranker → Answer → Quiz → Memory → Recommender) ----------
export interface AgentPlan {
  intent: 'explain' | 'quiz' | 'notes' | 'plan' | 'chat';
  retrievalQueries: string[];
  explainLevel: string | null;
  needsQuiz: boolean;
  quizCount: number;
  needsVisual: boolean;
  reasoning: string;
}
export interface AgentStepEvent {
  step: 'planner' | 'retriever' | 'reranker' | 'answer' | 'quiz' | 'memory' | 'recommender';
  status: 'start' | 'end';
  data?: any;
}
export interface AgentRunResult {
  plan: AgentPlan;
  answer: string;
  citations: Citation[];
  confidence: number;
  quiz?: { title: string; questions: any[] };
  memoryNote?: string;
  recommendation?: RecommendResult;
  providerId?: string;
  model?: string;
}
export const agent = {
  run: (
    body: { question: string; docIds?: string[]; collection?: Collection; useMemory?: boolean; skipQuiz?: boolean },
    handlers: {
      onStep: (e: AgentStepEvent) => void;
      onToken: (t: string) => void;
      onDone: (r: AgentRunResult) => void;
      onError: (e: string) => void;
    }
  ) => {
    return fetch('/api/agent/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then((res) => {
      if (!res.body) throw new Error('No response stream');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      const read = () => {
        reader.read().then(({ done, value }) => {
          if (done) return;
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split('\n\n');
          buf = parts.pop() || '';
          for (const part of parts) {
            const line = part.replace(/^data: /, '').trim();
            if (!line) continue;
            try {
              const evt = JSON.parse(line);
              if (evt.token) handlers.onToken(evt.token);
              else if (evt.error) handlers.onError(evt.error);
              else if (evt.done) handlers.onDone(evt.result);
              else if (evt.step) handlers.onStep(evt);
            } catch {}
          }
          read();
        });
      };
      read();
    });
  }
};

// ---------- Progress ----------
export interface Progress {
  xp: number;
  streak: number;
  mastery: number;
  totals: Record<string, number>;
  weakTopics: { topic: string; correct: number; incorrect: number; weakness: number }[];
}
export const progress = {
  get: () => api.get<Progress>('/progress').then((r) => r.data),
  activity: (body: { type: string; correct?: number; incorrect?: number; topic?: string; score?: number; minutes?: number }) =>
    api.post<Progress>('/progress/activity', body).then((r) => r.data)
};
// ---------- Analytics ----------
export interface Analytics {
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
  learningEfficiency: number;
  retentionRate: number;
  predictionAccuracy: number | null;
  optimalStudyTime: { hour: number; day: string } | null;
  burnoutRisk: number;
  readinessScore: Record<string, number>;
  conceptConnections: { from: string; to: string; strength: number }[];
  strugglingConcepts: { concept: string; attempts: number; successRate: number }[];
  masteredConcepts: { concept: string; level: number; lastReviewed: string }[];
}
export const analytics = {
  get: () => api.get<Analytics>('/analytics').then((r) => r.data)
};

// ---------- Advanced Analytics / Memory ----------
export interface LearningProfile {
  streakDays: number;
  totalStudyHours: number;
  burnoutRisk: number;
  optimalStudyTime: { hour: number; effectiveness: number } | null;
  weakConcepts: string[];
  strongConcepts: string[];
  conceptsDueForReview: string[];
  totalConcepts: number;
  masteredConcepts: number;
  questionsAsked: number;
  studySessions: number;
  recentMistakes: { concept: string; detail: string; ts: string }[];
}
export interface AdvancedAnalytics {
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
  learningEfficiency: number;
  retentionRate: number;
  predictionAccuracy: number;
  optimalStudyTime: { hour: number; day: string };
  burnoutRisk: number;
  readinessScore: Record<string, number>;
  conceptConnections: { from: string; to: string; strength: number }[];
  strugglingConcepts: { concept: string; attempts: number; successRate: number }[];
  masteredConcepts: { concept: string; level: number; lastReviewed: string }[];
}
export interface ConceptDetails {
  concept: string;
  masteryLevel: number;
  evidence: string[];
  lastUpdate?: string;
  quizStats: { correct: number; incorrect: number; confidence: number; lastAttempt: string } | null;
  retention: { score: number; lastReview: string; nextReview: string } | null;
  cognitiveLoad: number;
  learningVelocity: number;
}
export interface RecommendationsResult {
  recommendations: {
    type: string;
    priority: string;
    title: string;
    message: string;
    action: string;
    concepts?: string[];
  }[];
}
export const advancedAnalytics = {
  get: () => api.get<AdvancedAnalytics>('/analytics/advanced').then((r) => r.data),
  profile: () => api.get<LearningProfile>('/analytics/advanced/profile').then((r) => r.data),
  concept: (concept: string) => api.get<ConceptDetails>(`/analytics/advanced/concept/${encodeURIComponent(concept)}`).then((r) => r.data),
  recommendations: () => api.get<RecommendationsResult>('/analytics/advanced/recommendations').then((r) => r.data),
  graph: () => api.get('/analytics/advanced/graph').then((r) => r.data),
};

// ---------- Admin ----------
export interface AdminLog {
  type: string;
  topic: string;
  correct?: number;
  incorrect?: number;
  ts: string;
}
export interface AdminOverview {
  docCount: number;
  documents: KnowledgeDoc[];
  users: { name: string; role: string; documents: number }[];
  subjects: string[];
  storageBytes: number;
  faiss: boolean;
  analytics: Analytics;
  logs: AdminLog[];
}
export const admin = {
  overview: () => api.get<AdminOverview>('/admin/overview').then((r) => r.data)
};

// ---------- History ----------
export interface HistoryItem {
  id: string;
  type: string;
  subType?: string;
  title: string;
  content: any;
  metadata: {
    generatedAt: string;
    providerId?: string;
    model?: string;
    tags?: string[];
    subject?: string;
    topic?: string;
    source?: any;
    prompt?: string;
    status?: string;
  };
  score?: {
    totalQuestions?: number;
    correctAnswers?: number;
    percentage?: number;
    attempts?: number;
    lastAttempt?: string;
  };
  usage?: {
    viewCount?: number;
    lastViewed?: string;
    timeSpent?: number;
  };
  isFavorite: boolean;
  notes?: string;
}
export const history = {
  draft: (body: any) => api.post<{ id: string }>('/history/draft', body).then((r) => r.data),
  get: (params?: any) => api.get<{ items: HistoryItem[]; total: number }>('/history', { params }).then((r) => r.data),
  getItem: (id: string) => api.get<HistoryItem>(`/history/${id}`).then((r) => r.data),
  update: (id: string, body: any) => api.patch<HistoryItem>(`/history/${id}`, body).then((r) => r.data),
  delete: (id: string) => api.delete(`/history/${id}`).then((r) => r.data),
  clear: (body?: any) => api.post('/history/clear', body || {}).then((r) => r.data),
  toggleFavorite: (id: string) => api.post(`/history/${id}/favorite`).then((r) => r.data),
  updateScore: (id: string, score: any) => api.post(`/history/${id}/score`, score).then((r) => r.data),
  search: (query: string, params?: any) => api.get('/history/search/query', { params: { q: query, ...params } }).then((r) => r.data),
  stats: (params?: any) => api.get('/history/stats/summary', { params }).then((r) => r.data),
  recordView: (id: string, timeSpent?: number) => api.post(`/history/${id}/view`, { timeSpent }).then((r) => r.data),
};

// ---------- Export ----------
export const exp = {
  pptx: (deck: any) =>
    api.post('/export/pptx', deck, { responseType: 'blob' }).then((r) => r.data as Blob),
  flashcardsTsv: (set: any) =>
    api.post('/export/flashcards-tsv', set, { responseType: 'blob' }).then((r) => r.data as Blob),
  quizCsv: (quiz: any) =>
    api.post('/export/quiz-csv', quiz, { responseType: 'blob' }).then((r) => r.data as Blob),
  revisionPdf: (body: { title: string; topics: string[] }) =>
    api.post('/export/revision-pdf', body, { responseType: 'blob' }).then((r) => r.data as Blob),
  notesMd: (notesPack: any) =>
    api.post('/export/notes-md', notesPack, { responseType: 'blob' }).then((r) => r.data as Blob)
};

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

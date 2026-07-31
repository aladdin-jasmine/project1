import { readJson, writeJson } from '../db/store.js';
import type { AdvancedSettings, TaskType, TaskModelConfig } from '../types.js';

const FILE = 'settings';

// Default task configurations with appropriate token limits
function getDefaultTaskConfigs(): Record<TaskType, TaskModelConfig> {
  const tasks: TaskType[] = [
    'slides', 'flashcards', 'quiz', 'mindmap', 'studyplan',
    'chat', 'agent', 'notes',
    'visual', 'graph', 'recommend', 'predict',
    'voice-stt', 'voice-tts', 'embeddings'
  ];

  const configs: Record<string, TaskModelConfig> = {};
  tasks.forEach(task => {
    // Set task-specific defaults
    let maxTokens = 4000; // Default

    // Higher limits for content-heavy tasks to avoid 413 errors and ensure quality
    if (task === 'notes') maxTokens = 12000; // Increased for comprehensive notes
    if (task === 'quiz') maxTokens = 8000; // More for detailed explanations
    if (task === 'slides') maxTokens = 8000; // Comprehensive slides
    if (task === 'agent') maxTokens = 8000; // Multi-step reasoning
    if (task === 'chat') maxTokens = 6000; // Longer conversations

    configs[task] = {
      taskType: task,
      useDefault: true,
      fallbackToDefault: true,
      maxTokens
    };
  });

  return configs as Record<TaskType, TaskModelConfig>;
}

const DEFAULTS: AdvancedSettings = {
  maxRetries: 3,
  backoffMs: 2000,
  backoffFactor: 1.2,
  triggerCodes: [429, 413, 401, 403, 500, 503],
  failbackMode: 'key-then-provider',
  embeddingProviderId: undefined,
  embeddingModel: 'text-embedding-3-small',
  localEmbeddingFallback: true,
  hybridSearch: true,
  reranker: false,
  rerankerModel: 'Xenova/bge-reranker-base',
  multiQuery: true,
  contextCompression: true,
  compressionTokens: 1500,
  learningStyle: 'balanced',
  defaultExplainLevel: 'Engineering',
  dynamicModelSwitch: false,
  dynamicModelPool: [],
  taskConfigs: getDefaultTaskConfigs()
};

export function getSettings(): AdvancedSettings {
  const s = readJson<Partial<AdvancedSettings>>(FILE, {});
  return { 
    ...DEFAULTS, 
    ...s,
    taskConfigs: { ...DEFAULTS.taskConfigs, ...(s.taskConfigs || {}) }
  };
}

export function updateSettings(patch: Partial<AdvancedSettings>): AdvancedSettings {
  const current = getSettings();
  const next = { ...current, ...patch };
  // Deep-merge taskConfigs to prevent saving only one entry and losing others
  if (patch.taskConfigs) {
    next.taskConfigs = { ...current.taskConfigs, ...patch.taskConfigs };
  }
  writeJson(FILE, next);
  return next;
}

export function updateTaskConfig(taskType: TaskType, config: Partial<TaskModelConfig>): AdvancedSettings {
  const settings = getSettings();
  settings.taskConfigs[taskType] = {
    ...settings.taskConfigs[taskType],
    ...config,
    taskType
  };
  writeJson(FILE, settings);
  return settings;
}

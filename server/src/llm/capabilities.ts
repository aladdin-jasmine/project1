import type { ModelInfo, ModelCapability, TaskType } from '../types.js';

// ---------------------------------------------------------------------------
// Model Capabilities Registry
// Defines capabilities for known models (Groq, OpenAI, Anthropic, etc.)
// Used for intelligent model selection based on task requirements
// ---------------------------------------------------------------------------

// Groq Models (from https://console.groq.com/docs/models)
export const GROQ_MODELS: Record<string, ModelInfo> = {
  // Text Models (Chat Completion)
  'llama-3.3-70b-versatile': {
    id: 'llama-3.3-70b-versatile',
    name: 'Llama 3.3 70B Versatile',
    capabilities: ['text', 'reasoning'],
    contextWindow: 128000,
    maxTokens: 32768,
    enabled: true,
    metadata: { 
      speed: 'fast', 
      quality: 'high', 
      vendor: 'Meta',
      description: 'Most capable Llama model for complex tasks'
    }
  },
  'llama-3.1-70b-versatile': {
    id: 'llama-3.1-70b-versatile',
    name: 'Llama 3.1 70B Versatile',
    capabilities: ['text', 'reasoning'],
    contextWindow: 128000,
    maxTokens: 32768,
    enabled: true,
    metadata: { 
      speed: 'fast', 
      quality: 'high', 
      vendor: 'Meta',
      description: 'Versatile model for most tasks'
    }
  },
  'llama-3.1-8b-instant': {
    id: 'llama-3.1-8b-instant',
    name: 'Llama 3.1 8B Instant',
    capabilities: ['text'],
    contextWindow: 128000,
    maxTokens: 8192,
    enabled: true,
    metadata: { 
      speed: 'fast', 
      quality: 'medium', 
      vendor: 'Meta',
      description: 'Fastest model for simple tasks'
    }
  },
  'llama-3.2-1b-preview': {
    id: 'llama-3.2-1b-preview',
    name: 'Llama 3.2 1B Preview',
    capabilities: ['text'],
    contextWindow: 128000,
    maxTokens: 8192,
    enabled: true,
    metadata: { 
      speed: 'fast', 
      quality: 'medium', 
      vendor: 'Meta',
      description: 'Lightweight model for basic tasks'
    }
  },
  'llama-3.2-3b-preview': {
    id: 'llama-3.2-3b-preview',
    name: 'Llama 3.2 3B Preview',
    capabilities: ['text'],
    contextWindow: 128000,
    maxTokens: 8192,
    enabled: true,
    metadata: { 
      speed: 'fast', 
      quality: 'medium', 
      vendor: 'Meta',
      description: 'Balanced lightweight model'
    }
  },
  'mixtral-8x7b-32768': {
    id: 'mixtral-8x7b-32768',
    name: 'Mixtral 8x7B',
    capabilities: ['text', 'reasoning'],
    contextWindow: 32768,
    maxTokens: 32768,
    enabled: true,
    metadata: { 
      speed: 'medium', 
      quality: 'high', 
      vendor: 'Mistral AI',
      description: 'Mixture of experts for complex reasoning'
    }
  },
  'gemma2-9b-it': {
    id: 'gemma2-9b-it',
    name: 'Gemma 2 9B',
    capabilities: ['text'],
    contextWindow: 8192,
    maxTokens: 8192,
    enabled: true,
    metadata: { 
      speed: 'fast', 
      quality: 'medium', 
      vendor: 'Google',
      description: 'Google\'s open model'
    }
  },
  'gemma-7b-it': {
    id: 'gemma-7b-it',
    name: 'Gemma 7B',
    capabilities: ['text'],
    contextWindow: 8192,
    maxTokens: 8192,
    enabled: true,
    metadata: { 
      speed: 'fast', 
      quality: 'medium', 
      vendor: 'Google',
      description: 'Lightweight Google model'
    }
  },
  
  // Vision Models
  'llama-3.2-11b-vision-preview': {
    id: 'llama-3.2-11b-vision-preview',
    name: 'Llama 3.2 11B Vision',
    capabilities: ['text', 'vision'],
    contextWindow: 128000,
    maxTokens: 8192,
    enabled: true,
    metadata: { 
      speed: 'medium', 
      quality: 'high', 
      vendor: 'Meta',
      description: 'Vision-capable model for image understanding'
    }
  },
  'llama-3.2-90b-vision-preview': {
    id: 'llama-3.2-90b-vision-preview',
    name: 'Llama 3.2 90B Vision',
    capabilities: ['text', 'vision'],
    contextWindow: 128000,
    maxTokens: 8192,
    enabled: true,
    metadata: { 
      speed: 'medium', 
      quality: 'high', 
      vendor: 'Meta',
      description: 'Most capable vision model'
    }
  },
  
  // Voice Models (STT)
  'whisper-large-v3': {
    id: 'whisper-large-v3',
    name: 'Whisper Large V3',
    capabilities: ['voice-stt'],
    contextWindow: 0,
    maxTokens: 0,
    enabled: true,
    metadata: { 
      speed: 'fast', 
      quality: 'high', 
      vendor: 'OpenAI',
      description: 'High-accuracy speech recognition'
    }
  },
  'whisper-large-v3-turbo': {
    id: 'whisper-large-v3-turbo',
    name: 'Whisper Large V3 Turbo',
    capabilities: ['voice-stt'],
    contextWindow: 0,
    maxTokens: 0,
    enabled: true,
    metadata: { 
      speed: 'fast', 
      quality: 'high', 
      vendor: 'OpenAI',
      description: 'Fastest speech recognition'
    }
  },
  'distil-whisper-large-v3-en': {
    id: 'distil-whisper-large-v3-en',
    name: 'Distil-Whisper English',
    capabilities: ['voice-stt'],
    contextWindow: 0,
    maxTokens: 0,
    enabled: true,
    metadata: { 
      speed: 'fast', 
      quality: 'medium', 
      vendor: 'Hugging Face',
      description: 'Optimized for English'
    }
  },
  
  // Voice Models (TTS)
  'canopylabs/orpheus-v1-english': {
    id: 'canopylabs/orpheus-v1-english',
    name: 'Orpheus English',
    capabilities: ['voice-tts'],
    contextWindow: 0,
    maxTokens: 0,
    enabled: true,
    metadata: { 
      speed: 'fast', 
      quality: 'high', 
      vendor: 'Canopy Labs',
      description: 'Natural English speech synthesis'
    }
  }
};

// OpenAI Models
export const OPENAI_MODELS: Record<string, ModelInfo> = {
  'gpt-4o': {
    id: 'gpt-4o',
    name: 'GPT-4o',
    capabilities: ['text', 'vision', 'reasoning'],
    contextWindow: 128000,
    maxTokens: 16384,
    enabled: true,
    pricing: { input: 2.5, output: 10 },
    metadata: { 
      speed: 'medium', 
      quality: 'high', 
      vendor: 'OpenAI',
      description: 'Most capable multimodal model'
    }
  },
  'gpt-4o-mini': {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    capabilities: ['text', 'vision'],
    contextWindow: 128000,
    maxTokens: 16384,
    enabled: true,
    pricing: { input: 0.15, output: 0.6 },
    metadata: { 
      speed: 'fast', 
      quality: 'high', 
      vendor: 'OpenAI',
      description: 'Fast and affordable'
    }
  },
  'gpt-4-turbo': {
    id: 'gpt-4-turbo',
    name: 'GPT-4 Turbo',
    capabilities: ['text', 'vision', 'reasoning'],
    contextWindow: 128000,
    maxTokens: 4096,
    enabled: true,
    pricing: { input: 10, output: 30 },
    metadata: { 
      speed: 'medium', 
      quality: 'high', 
      vendor: 'OpenAI',
      description: 'Previous generation flagship'
    }
  },
  'gpt-3.5-turbo': {
    id: 'gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    capabilities: ['text'],
    contextWindow: 16385,
    maxTokens: 4096,
    enabled: true,
    pricing: { input: 0.5, output: 1.5 },
    metadata: { 
      speed: 'fast', 
      quality: 'medium', 
      vendor: 'OpenAI',
      description: 'Fast and economical'
    }
  },
  'text-embedding-3-large': {
    id: 'text-embedding-3-large',
    name: 'Embedding 3 Large',
    capabilities: ['embeddings'],
    contextWindow: 8191,
    maxTokens: 0,
    enabled: true,
    pricing: { input: 0.13, output: 0 },
    metadata: { 
      speed: 'fast', 
      quality: 'high', 
      vendor: 'OpenAI',
      description: 'High-quality embeddings'
    }
  },
  'text-embedding-3-small': {
    id: 'text-embedding-3-small',
    name: 'Embedding 3 Small',
    capabilities: ['embeddings'],
    contextWindow: 8191,
    maxTokens: 0,
    enabled: true,
    pricing: { input: 0.02, output: 0 },
    metadata: { 
      speed: 'fast', 
      quality: 'medium', 
      vendor: 'OpenAI',
      description: 'Affordable embeddings'
    }
  }
};

// Anthropic Models
export const ANTHROPIC_MODELS: Record<string, ModelInfo> = {
  'claude-3-5-sonnet-20241022': {
    id: 'claude-3-5-sonnet-20241022',
    name: 'Claude 3.5 Sonnet',
    capabilities: ['text', 'vision', 'reasoning'],
    contextWindow: 200000,
    maxTokens: 8192,
    enabled: true,
    pricing: { input: 3, output: 15 },
    metadata: { 
      speed: 'medium', 
      quality: 'high', 
      vendor: 'Anthropic',
      description: 'Most intelligent Claude model'
    }
  },
  'claude-3-5-haiku-20241022': {
    id: 'claude-3-5-haiku-20241022',
    name: 'Claude 3.5 Haiku',
    capabilities: ['text', 'vision'],
    contextWindow: 200000,
    maxTokens: 8192,
    enabled: true,
    pricing: { input: 1, output: 5 },
    metadata: { 
      speed: 'fast', 
      quality: 'high', 
      vendor: 'Anthropic',
      description: 'Fast and capable'
    }
  },
  'claude-3-opus-20240229': {
    id: 'claude-3-opus-20240229',
    name: 'Claude 3 Opus',
    capabilities: ['text', 'vision', 'reasoning'],
    contextWindow: 200000,
    maxTokens: 4096,
    enabled: true,
    pricing: { input: 15, output: 75 },
    metadata: { 
      speed: 'slow', 
      quality: 'high', 
      vendor: 'Anthropic',
      description: 'Previous flagship model'
    }
  }
};

// Task Requirements
export const TASK_REQUIREMENTS: Record<TaskType, {
  requiredCapability: ModelCapability;
  preferredModels?: string[];
  fallbackCapability?: ModelCapability;
  minContextWindow?: number;
  description: string;
}> = {
  'slides': { 
    requiredCapability: 'text',
    minContextWindow: 8000,
    preferredModels: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768', 'gpt-4o'],
    description: 'Generate presentation slides with structure and content'
  },
  'flashcards': { 
    requiredCapability: 'text',
    minContextWindow: 4000,
    preferredModels: ['llama-3.1-8b-instant', 'gpt-3.5-turbo'],
    description: 'Create flashcards for spaced repetition'
  },
  'quiz': { 
    requiredCapability: 'text',
    minContextWindow: 4000,
    preferredModels: ['llama-3.3-70b-versatile', 'claude-3-5-sonnet-20241022'],
    description: 'Generate quizzes with multiple question types'
  },
  'mindmap': { 
    requiredCapability: 'text',
    minContextWindow: 8000,
    preferredModels: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768'],
    description: 'Create hierarchical mind maps'
  },
  'studyplan': { 
    requiredCapability: 'reasoning',
    fallbackCapability: 'text',
    minContextWindow: 8000,
    preferredModels: ['llama-3.3-70b-versatile', 'gpt-4o', 'claude-3-5-sonnet-20241022'],
    description: 'Generate personalized study schedules'
  },
  'chat': { 
    requiredCapability: 'text',
    minContextWindow: 8000,
    description: 'Conversational Q&A with RAG'
  },
  'agent': { 
    requiredCapability: 'reasoning',
    fallbackCapability: 'text',
    minContextWindow: 16000,
    preferredModels: ['llama-3.3-70b-versatile', 'gpt-4o', 'claude-3-5-sonnet-20241022'],
    description: 'Multi-agent orchestrated responses'
  },
  'notes': { 
    requiredCapability: 'text',
    minContextWindow: 8000,
    description: 'Generate study notes in various formats'
  },
  'visual': { 
    requiredCapability: 'text',
    minContextWindow: 4000,
    description: 'Generate Mermaid diagrams'
  },
  'graph': { 
    requiredCapability: 'reasoning',
    fallbackCapability: 'text',
    minContextWindow: 8000,
    preferredModels: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768'],
    description: 'Create knowledge graphs'
  },
  'recommend': { 
    requiredCapability: 'reasoning',
    fallbackCapability: 'text',
    minContextWindow: 4000,
    description: 'Recommend study topics'
  },
  'predict': { 
    requiredCapability: 'reasoning',
    fallbackCapability: 'text',
    minContextWindow: 4000,
    preferredModels: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768'],
    description: 'Predict learning difficulty and next topics'
  },
  'voice-stt': { 
    requiredCapability: 'voice-stt',
    preferredModels: ['whisper-large-v3-turbo', 'whisper-large-v3'],
    description: 'Speech-to-text transcription'
  },
  'voice-tts': { 
    requiredCapability: 'voice-tts',
    preferredModels: ['canopylabs/orpheus-v1-english'],
    description: 'Text-to-speech synthesis'
  },
  'embeddings': { 
    requiredCapability: 'embeddings',
    fallbackCapability: 'text',
    preferredModels: ['text-embedding-3-large', 'text-embedding-3-small'],
    description: 'Generate text embeddings for RAG'
  }
};

// Helper: Get model info by ID
export function getModelInfo(modelId: string): ModelInfo | null {
  return GROQ_MODELS[modelId] || OPENAI_MODELS[modelId] || ANTHROPIC_MODELS[modelId] || null;
}

// Helper: Get all models with a specific capability
export function getModelsByCapability(capability: ModelCapability): ModelInfo[] {
  const allModels = [
    ...Object.values(GROQ_MODELS),
    ...Object.values(OPENAI_MODELS),
    ...Object.values(ANTHROPIC_MODELS)
  ];
  return allModels.filter(m => m.capabilities.includes(capability) && m.enabled);
}

// Helper: Check if model supports task
export function modelSupportsTask(model: ModelInfo, taskType: TaskType): boolean {
  const requirements = TASK_REQUIREMENTS[taskType];
  if (!requirements) return false;
  
  // Check required capability
  if (model.capabilities.includes(requirements.requiredCapability)) {
    // Check minimum context window
    if (requirements.minContextWindow && model.contextWindow < requirements.minContextWindow) {
      return false;
    }
    return true;
  }
  
  // Check fallback capability
  if (requirements.fallbackCapability && model.capabilities.includes(requirements.fallbackCapability)) {
    return true;
  }
  
  return false;
}

// Helper: Get recommended models for task
export function getRecommendedModels(taskType: TaskType): string[] {
  const requirements = TASK_REQUIREMENTS[taskType];
  return requirements?.preferredModels || [];
}

// Helper: Detect model capabilities from model ID
export function detectModelCapabilities(modelId: string, format: 'openai' | 'anthropic'): ModelCapability[] {
  // Check known models first
  const known = getModelInfo(modelId);
  if (known) return known.capabilities;
  
  // Heuristic detection for unknown models
  const id = modelId.toLowerCase();
  const capabilities: ModelCapability[] = [];
  
  // Vision detection
  if (id.includes('vision') || id.includes('gpt-4o') || id.includes('claude-3')) {
    capabilities.push('vision');
  }
  
  // Voice detection
  if (id.includes('whisper')) {
    capabilities.push('voice-stt');
  }
  if (id.includes('tts') || id.includes('orpheus')) {
    capabilities.push('voice-tts');
  }
  
  // Embedding detection
  if (id.includes('embedding') || id.includes('embed')) {
    capabilities.push('embeddings');
  }
  
  // Reasoning detection (larger models)
  if (id.includes('70b') || id.includes('90b') || id.includes('opus') || id.includes('gpt-4')) {
    capabilities.push('reasoning');
  }
  
  // All chat models support text
  if (capabilities.length === 0 || id.includes('gpt') || id.includes('claude') || id.includes('llama') || id.includes('mixtral')) {
    capabilities.push('text');
  }
  
  return capabilities;
}

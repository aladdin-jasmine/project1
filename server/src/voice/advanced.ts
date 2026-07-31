import { transcribeAudio, synthesizeSpeech, voiceStatus, STT_MODELS, TTS_MODELS } from './speech.js';
import { chat } from '../llm/client.js';
import { retrieve } from '../rag/retrieve.js';
import { startStudySession, endStudySession, recordQuestion } from '../db/memory.js';
import { logger } from '../util/logger.js';
import type { ChatMessage, Collection } from '../types.js';

// ---------------------------------------------------------------------------
// Advanced Voice Tutor — Full-duplex conversational AI tutor
// 
// Features:
// - Multi-turn voice conversations with context
// - RAG-enhanced responses with citations
// - Automatic study session tracking
// - Groq Whisper STT with multi-key load balancing
// - Groq Orpheus TTS with failover
// - Conversation state management
// - Audio quality optimization
// ---------------------------------------------------------------------------

export interface VoiceSession {
  id: string;
  started: string;
  messages: ChatMessage[];
  topics: string[];
  audioHistory: { role: 'user' | 'assistant'; audioBuffer?: Buffer; text: string }[];
}

const activeSessions = new Map<string, VoiceSession>();

/**
 * Start a new voice tutoring session
 */
export function startVoiceSession(): string {
  const sessionId = `voice-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const session: VoiceSession = {
    id: sessionId,
    started: new Date().toISOString(),
    messages: [],
    topics: [],
    audioHistory: []
  };
  
  activeSessions.set(sessionId, session);
  startStudySession();
  
  logger.info(`Voice session started: ${sessionId}`);
  return sessionId;
}

/**
 * Process voice input and generate voice response
 */
export async function processVoiceMessage(
  sessionId: string,
  audioBuffer: Buffer,
  audioMimeType: string,
  options: {
    projectId?: string;
    providerId?: string;
    model?: string;
    collection?: Collection;
    docIds?: string[];
    voice?: string;
    language?: string;
  } = {}
): Promise<{
  text: string;
  audioBuffer: Buffer;
  citations?: any[];
  confidence?: number;
}> {
  const session = activeSessions.get(sessionId);
  if (!session) {
    throw new Error(`Voice session not found: ${sessionId}`);
  }

  try {
    // Step 1: Transcribe audio to text (Groq Whisper)
    const sttResult = await transcribeAudio(audioBuffer, audioMimeType, {
      providerId: options.providerId,
      language: options.language || 'en'
    });
    
    const userText = sttResult.text || '';
    logger.info(`STT (${sttResult.model}): "${userText.slice(0, 100)}..."`);
    
    if (!userText.trim()) {
      throw new Error('No speech detected in audio');
    }

    // Record question for analytics
    recordQuestion(userText);

    // Add user message to session
    session.messages.push({
      role: 'user',
      content: userText
    });
    session.audioHistory.push({
      role: 'user',
      text: userText
    });

    // Step 2: Retrieve relevant context (RAG)
    let context = '';
    let citations: any[] = [];
    let confidence = 70;
    
    try {
      const chunks = await retrieve(userText, 5, {
        docIds: options.docIds,
        collection: options.collection
      });
      
      if (chunks.length > 0) {
        context = chunks.map((c, i) => `[${i + 1}] ${c.text.slice(0, 300)}`).join('\n\n');
        citations = chunks.map((c, i) => ({
          index: i + 1,
          snippet: c.text.slice(0, 150),
          score: c.score || 0
        }));
        confidence = Math.round(Math.min(95, (chunks[0]?.score || 0.7) * 100));
      }
    } catch (err: any) {
      logger.warn(`RAG retrieval failed for voice: ${err?.message}`);
    }

    // Step 3: Generate AI response
    const systemPrompt = context
      ? `You are a conversational AI tutor in a voice session. Answer naturally and concisely (2-3 sentences max for voice).
Use the context below to provide accurate answers. Be friendly and encouraging.

Context from course materials:
${context}`
      : `You are a conversational AI tutor in a voice session. Answer naturally and concisely (2-3 sentences max for voice).
Be friendly, encouraging, and helpful.`;

    const conversationMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...session.messages.slice(-6) // Keep last 6 messages for context
    ];

    const aiResponse = await chat({
      projectId: options.projectId,
      providerId: options.providerId,
      model: options.model,
      messages: conversationMessages,
      temperature: 0.7,
      maxTokens: 300 // Keep responses concise for voice
    });

    const responseText = aiResponse.content;
    logger.info(`AI response: "${responseText.slice(0, 100)}..."`);

    // Add assistant message to session
    session.messages.push({
      role: 'assistant',
      content: responseText
    });

    // Extract topics mentioned
    extractTopics(userText, session);

    // Step 4: Synthesize speech (Groq Orpheus)
    const ttsResult = await synthesizeSpeech(responseText, {
      providerId: options.providerId,
      voice: options.voice || 'autumn'
    });

    logger.info(`TTS (${ttsResult.model}): Generated ${ttsResult.buffer?.length || 0} bytes`);

    // Store audio in history
    session.audioHistory.push({
      role: 'assistant',
      text: responseText,
      audioBuffer: ttsResult.buffer
    });

    return {
      text: responseText,
      audioBuffer: ttsResult.buffer!,
      citations: citations.length > 0 ? citations : undefined,
      confidence: citations.length > 0 ? confidence : undefined
    };
  } catch (error: any) {
    logger.error(`Voice processing error: ${error.message}`);
    throw error;
  }
}

/**
 * End a voice session and calculate effectiveness
 */
export function endVoiceSession(sessionId: string): {
  duration: number;
  messageCount: number;
  topics: string[];
  effectiveness: number;
} {
  const session = activeSessions.get(sessionId);
  if (!session) {
    throw new Error(`Voice session not found: ${sessionId}`);
  }

  const duration = Date.now() - new Date(session.started).getTime();
  const messageCount = session.messages.filter(m => m.role === 'user').length;
  
  // Calculate effectiveness based on interaction quality
  const effectiveness = Math.min(1.0, messageCount / 10 * 0.5 + 0.5);
  
  endStudySession(session.topics, effectiveness);
  activeSessions.delete(sessionId);
  
  logger.info(`Voice session ended: ${sessionId}, ${messageCount} messages, ${session.topics.length} topics`);
  
  return {
    duration,
    messageCount,
    topics: session.topics,
    effectiveness
  };
}

/**
 * Get voice session history
 */
export function getVoiceSession(sessionId: string): VoiceSession | null {
  return activeSessions.get(sessionId) || null;
}

/**
 * Get all active voice sessions
 */
export function getActiveSessions(): string[] {
  return Array.from(activeSessions.keys());
}

/**
 * Get voice system status with Groq capabilities
 */
export function getVoiceSystemStatus() {
  const status = voiceStatus();
  const sessions = Array.from(activeSessions.values()).map(s => ({
    id: s.id,
    started: s.started,
    messageCount: s.messages.length,
    topics: s.topics
  }));

  return {
    ...status,
    activeSessions: sessions,
    capabilities: {
      stt: {
        models: STT_MODELS,
        features: ['multi-key load balancing', 'automatic failover', 'language detection']
      },
      tts: {
        models: TTS_MODELS,
        features: ['natural voices', 'multi-key load balancing', 'automatic failover'],
        voices: ['autumn', 'diana', 'hannah', 'austin', 'daniel', 'troy']
      },
      conversation: {
        features: [
          'multi-turn context',
          'RAG-enhanced responses',
          'citation support',
          'study session tracking',
          'topic extraction',
          'effectiveness analysis'
        ]
      }
    }
  };
}

/**
 * Extract topics from user speech for session tracking
 */
function extractTopics(text: string, session: VoiceSession): void {
  // Simple keyword extraction (can be enhanced with NLP)
  const commonTopics = [
    'binary tree', 'algorithm', 'data structure', 'networking', 'database',
    'operating system', 'computer architecture', 'programming', 'sorting',
    'searching', 'graph', 'dynamic programming', 'tcp', 'ip', 'http',
    'sql', 'nosql', 'process', 'thread', 'memory management'
  ];

  const textLower = text.toLowerCase();
  commonTopics.forEach(topic => {
    if (textLower.includes(topic) && !session.topics.includes(topic)) {
      session.topics.push(topic);
    }
  });
}

/**
 * Batch transcribe multiple audio files (useful for lecture recordings)
 */
export async function batchTranscribe(
  audioFiles: { buffer: Buffer; mimeType: string; name: string }[],
  options: { providerId?: string; language?: string } = {}
): Promise<{ name: string; text: string; success: boolean; error?: string }[]> {
  const results = [];
  
  for (const file of audioFiles) {
    try {
      const result = await transcribeAudio(file.buffer, file.mimeType, options);
      results.push({
        name: file.name,
        text: result.text || '',
        success: true
      });
    } catch (error: any) {
      results.push({
        name: file.name,
        text: '',
        success: false,
        error: error.message
      });
    }
  }
  
  return results;
}

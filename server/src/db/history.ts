// History system - Store all generated content (quizzes, slides, flashcards, etc.)
import { randomUUID } from 'crypto';
import { readJson, writeJson } from './store.js';
import type { Collection } from '../types.js';

export type HistoryItemType =
  | 'quiz' | 'flashcards' | 'slides' | 'notes' | 'mindmap'
  | 'studyplan' | 'visual' | 'graph'
  | 'recommendation' | 'prediction' | 'weakspot';

// Granular sub-types for different sections
export type HistorySubType =
  // Notes sub-types
  | 'short-notes' | 'exam-notes' | '2-mark' | '5-mark' | '10-mark'
  | 'one-page' | 'viva-questions'
  // Quiz sub-types
  | 'mcq' | 'short-answer' | 'long-answer' | 'coding' | 'fill-blank'
  | 'true-false' | 'mixed-quiz'
  // Slide types
  | 'presentation' | 'lecture' | 'tutorial'
  // Other
  | 'general';

export interface HistoryItem {
  id: string;
  type: HistoryItemType;
  subType?: HistorySubType; // 🆕 Granular sub-type for filtering within sections
  title: string;
  content: any; // The actual generated content (quiz, slides, etc.)
  metadata: {
    /** Owning product area; legacy records are inferred from their type. */
    scope?: 'studio' | 'notes';
    source?: {
      type: 'text' | 'doc' | 'topic' | 'web' | 'mixed' | 'multi';
      value?: string;
      docId?: string;
      docIds?: string[];
      urls?: string[];
      customText?: string;
      useAllDocs?: boolean;
    };
    prompt?: string;
    status?: string;
    projectId?: string;
    collection?: Collection;
    generatedAt: string;
    providerId?: string;
    model?: string;
    tags?: string[];
    subject?: string;
    topic?: string;
    difficulty?: string; // 🆕 For quizzes
    questionCount?: number; // 🆕 For quizzes
    slideCount?: number; // 🆕 For slides
    cardCount?: number; // 🆕 For flashcards
  };
  score?: {
    totalQuestions?: number;
    correctAnswers?: number;
    percentage?: number;
    attempts?: number;
    lastAttempt?: string;
  };
  usage?: {
    viewCount?: number; // 🆕 How many times viewed
    lastViewed?: string; // 🆕 Last view timestamp
    timeSpent?: number; // 🆕 Total time spent (seconds)
  };
  isFavorite: boolean;
  notes?: string;
}

interface HistoryDB {
  items: HistoryItem[];
}

let cache: HistoryDB | null = null;

function load(): HistoryDB {
  if (!cache) cache = readJson<HistoryDB>('history', { items: [] });
  return cache;
}

function persist(): void {
  if (cache) writeJson('history', cache);
}

// Create a draft history item (placeholder before generation completes)
export function addDraftHistoryItem(data: {
  type: HistoryItemType;
  subType?: HistorySubType;
  title: string;
  prompt?: string;
  source?: any;
  scope?: 'studio' | 'notes';
  status?: 'planning' | 'pending';
}): HistoryItem {
  const status = data.status || 'pending';
  return addHistoryItem({
    type: data.type,
    subType: data.subType,
    title: data.title || `${data.type} generation`,
    content: { _status: status, prompt: data.prompt, source: data.source },
    metadata: { source: data.source, prompt: data.prompt, scope: data.scope, generatedAt: new Date().toISOString() }
  });
}

// Add new history item
export function addHistoryItem(item: Omit<HistoryItem, 'id' | 'metadata' | 'isFavorite'> & { metadata?: Partial<HistoryItem['metadata']> }): HistoryItem {
  const db = load();
  const newItem: HistoryItem = {
    id: randomUUID(),
    type: item.type,
    subType: item.subType,
    title: item.title,
    content: item.content,
    metadata: {
      generatedAt: new Date().toISOString(),
      ...item.metadata
    },
    score: item.score,
    isFavorite: false,
    notes: item.notes
  };
  db.items.unshift(newItem); // Add to beginning
  persist();
  return newItem;
}

// Get all history items with optional filtering
export function getHistory(filters?: {
  type?: HistoryItemType | HistoryItemType[];
  subType?: HistorySubType | HistorySubType[]; // 🆕 Filter by sub-type
  projectId?: string;
  subject?: string;
  topic?: string;
  collection?: Collection;
  scope?: 'studio' | 'notes';
  isFavorite?: boolean;
  limit?: number;
  offset?: number;
}): { items: HistoryItem[]; total: number } {
  const db = load();
  let filtered = [...db.items];

  if (filters) {
    if (filters.type) {
      const types = Array.isArray(filters.type) ? filters.type : [filters.type];
      filtered = filtered.filter(item => types.includes(item.type));
    }
    if (filters.subType) {
      const subTypes = Array.isArray(filters.subType) ? filters.subType : [filters.subType];
      filtered = filtered.filter(item => item.subType && subTypes.includes(item.subType));
    }
    if (filters.projectId) {
      filtered = filtered.filter(item => item.metadata.projectId === filters.projectId);
    }
    if (filters.subject) {
      filtered = filtered.filter(item => item.metadata.subject === filters.subject);
    }
    if (filters.topic) {
      filtered = filtered.filter(item => item.metadata.topic === filters.topic);
    }
    if (filters.collection) {
      filtered = filtered.filter(item => item.metadata.collection === filters.collection);
    }
    if (filters.scope) {
      filtered = filtered.filter(item => (item.metadata.scope || (item.type === 'notes' ? 'notes' : 'studio')) === filters.scope);
    }
    if (filters.isFavorite !== undefined) {
      filtered = filtered.filter(item => item.isFavorite === filters.isFavorite);
    }
  }

  const total = filtered.length;
  const offset = filters?.offset || 0;
  const limit = filters?.limit || 50;
  
  return {
    items: filtered.slice(offset, offset + limit),
    total
  };
}

// Get single history item
export function getHistoryItem(id: string): HistoryItem | undefined {
  return load().items.find(item => item.id === id);
}

// Update history item
export function updateHistoryItem(id: string, updates: Partial<Omit<HistoryItem, 'id' | 'metadata'>> & { metadata?: Partial<HistoryItem['metadata']> }): HistoryItem | undefined {
  const db = load();
  const item = db.items.find(i => i.id === id);
  if (!item) return undefined;

  if (updates.title !== undefined) item.title = updates.title;
  if (updates.content !== undefined) item.content = updates.content;
  if (updates.score !== undefined) item.score = updates.score;
  if (updates.isFavorite !== undefined) item.isFavorite = updates.isFavorite;
  if (updates.notes !== undefined) item.notes = updates.notes;
  if (updates.metadata) {
    item.metadata = { ...item.metadata, ...updates.metadata };
  }

  persist();
  return item;
}

// Delete history item
export function deleteHistoryItem(id: string): boolean {
  const db = load();
  const index = db.items.findIndex(i => i.id === id);
  if (index === -1) return false;
  
  db.items.splice(index, 1);
  persist();
  return true;
}

// Clear all history (with optional filters)
export function clearHistory(filters?: {
  type?: HistoryItemType | HistoryItemType[];
  projectId?: string;
  olderThan?: string; // ISO date string
}): number {
  const db = load();
  const initialCount = db.items.length;

  if (!filters) {
    // Clear all
    db.items = [];
  } else {
    // Selective clear
    db.items = db.items.filter(item => {
      if (filters.type) {
        const types = Array.isArray(filters.type) ? filters.type : [filters.type];
        if (types.includes(item.type)) return false;
      }
      if (filters.projectId && item.metadata.projectId === filters.projectId) return false;
      if (filters.olderThan && item.metadata.generatedAt < filters.olderThan) return false;
      return true;
    });
  }

  persist();
  return initialCount - db.items.length;
}

// Boot-time purge: remove retired feature types
export function purgeRetiredFeatures(): number {
  const db = load();
  const initialCount = db.items.length;
  const retiredTypes = ['evaluation', 'explanation', 'summary', 'studypack'];

  db.items = db.items.filter(item => !retiredTypes.includes(item.type));

  const purged = initialCount - db.items.length;
  if (purged > 0) {
    persist();
  }
  return purged;
}

// Get statistics
export function getHistoryStats(projectId?: string): {
  totalItems: number;
  byType: Record<HistoryItemType, number>;
  totalQuizzes: number;
  totalQuizAttempts: number;
  averageQuizScore: number;
  favoriteCount: number;
  recentActivity: { date: string; count: number }[];
} {
  const db = load();
  const items = projectId 
    ? db.items.filter(i => i.metadata.projectId === projectId)
    : db.items;

  const byType: Record<string, number> = {};
  let totalQuizAttempts = 0;
  let totalQuizScore = 0;
  let quizCount = 0;

  items.forEach(item => {
    byType[item.type] = (byType[item.type] || 0) + 1;
    
    if (item.type === 'quiz' && item.score) {
      totalQuizAttempts += item.score.attempts || 0;
      totalQuizScore += item.score.percentage || 0;
      quizCount++;
    }
  });

  // Recent activity (last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const activityMap = new Map<string, number>();
  
  items.forEach(item => {
    const date = new Date(item.metadata.generatedAt);
    if (date >= sevenDaysAgo) {
      const dateKey = date.toISOString().split('T')[0];
      activityMap.set(dateKey, (activityMap.get(dateKey) || 0) + 1);
    }
  });

  const recentActivity = Array.from(activityMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    totalItems: items.length,
    byType: byType as Record<HistoryItemType, number>,
    totalQuizzes: byType['quiz'] || 0,
    totalQuizAttempts,
    averageQuizScore: quizCount > 0 ? totalQuizScore / quizCount : 0,
    favoriteCount: items.filter(i => i.isFavorite).length,
    recentActivity
  };
}

// Toggle favorite
export function toggleFavorite(id: string): boolean {
  const db = load();
  const item = db.items.find(i => i.id === id);
  if (!item) return false;
  
  item.isFavorite = !item.isFavorite;
  persist();
  return item.isFavorite;
}

// Update quiz score
export function updateQuizScore(id: string, score: HistoryItem['score']): HistoryItem | undefined {
  const db = load();
  const item = db.items.find(i => i.id === id);
  if (!item || item.type !== 'quiz') return undefined;
  
  item.score = {
    ...item.score,
    ...score,
    lastAttempt: new Date().toISOString()
  };
  
  persist();
  return item;
}

// Search history
export function searchHistory(query: string, filters?: {
  type?: HistoryItemType | HistoryItemType[];
  projectId?: string;
}): HistoryItem[] {
  const db = load();
  const searchTerm = query.toLowerCase();
  
  let items = db.items;
  
  if (filters) {
    if (filters.type) {
      const types = Array.isArray(filters.type) ? filters.type : [filters.type];
      items = items.filter(item => types.includes(item.type));
    }
    if (filters.projectId) {
      items = items.filter(item => item.metadata.projectId === filters.projectId);
    }
  }
  
  return items.filter(item =>
    item.title.toLowerCase().includes(searchTerm) ||
    item.metadata.subject?.toLowerCase().includes(searchTerm) ||
    item.metadata.topic?.toLowerCase().includes(searchTerm) ||
    item.metadata.tags?.some(tag => tag.toLowerCase().includes(searchTerm)) ||
    item.notes?.toLowerCase().includes(searchTerm)
  );
}

// Track when an item is viewed/used
export function recordView(id: string, timeSpent?: number): HistoryItem | undefined {
  const db = load();
  const item = db.items.find(i => i.id === id);
  if (!item) return undefined;
  
  if (!item.usage) {
    item.usage = {
      viewCount: 0,
      lastViewed: new Date().toISOString(),
      timeSpent: 0
    };
  }
  
  item.usage.viewCount = (item.usage.viewCount || 0) + 1;
  item.usage.lastViewed = new Date().toISOString();
  if (timeSpent) {
    item.usage.timeSpent = (item.usage.timeSpent || 0) + timeSpent;
  }
  
  persist();
  return item;
}

// Get history grouped by sub-type (for sectioned views)
export function getHistoryBySubType(
  type: HistoryItemType,
  projectId?: string
): Record<string, HistoryItem[]> {
  const db = load();
  const items = db.items.filter(item => {
    if (item.type !== type) return false;
    if (projectId && item.metadata.projectId !== projectId) return false;
    return true;
  });
  
  const grouped: Record<string, HistoryItem[]> = {};
  
  items.forEach(item => {
    const subType = item.subType || 'general';
    if (!grouped[subType]) {
      grouped[subType] = [];
    }
    grouped[subType].push(item);
  });
  
  // Sort each group by date (newest first)
  Object.keys(grouped).forEach(key => {
    grouped[key].sort((a, b) => 
      new Date(b.metadata.generatedAt).getTime() - new Date(a.metadata.generatedAt).getTime()
    );
  });
  
  return grouped;
}

// Get most recent items by type and sub-type
export function getRecentBySubType(
  type: HistoryItemType,
  subType: HistorySubType,
  limit: number = 10,
  projectId?: string
): HistoryItem[] {
  const history = getHistory({
    type,
    subType,
    projectId,
    limit
  });
  return history.items;
}

// Get most viewed items
export function getMostViewed(
  type?: HistoryItemType,
  limit: number = 10
): HistoryItem[] {
  const db = load();
  let items = [...db.items];
  
  if (type) {
    items = items.filter(item => item.type === type);
  }
  
  // Sort by view count
  items.sort((a, b) => {
    const aViews = a.usage?.viewCount || 0;
    const bViews = b.usage?.viewCount || 0;
    return bViews - aViews;
  });
  
  return items.slice(0, limit);
}

// Get statistics by sub-type
export function getStatsBySubType(
  type: HistoryItemType,
  projectId?: string
): Record<string, { count: number; avgScore?: number; totalViews: number }> {
  const db = load();
  const items = db.items.filter(item => {
    if (item.type !== type) return false;
    if (projectId && item.metadata.projectId !== projectId) return false;
    return true;
  });
  
  const stats: Record<string, { count: number; avgScore?: number; totalViews: number; scores: number[] }> = {};
  
  items.forEach(item => {
    const subType = item.subType || 'general';
    if (!stats[subType]) {
      stats[subType] = { count: 0, totalViews: 0, scores: [] };
    }
    
    stats[subType].count++;
    stats[subType].totalViews += item.usage?.viewCount || 0;
    
    if (item.score?.percentage !== undefined) {
      stats[subType].scores.push(item.score.percentage);
    }
  });
  
  // Calculate average scores
  Object.keys(stats).forEach(key => {
    if (stats[key].scores.length > 0) {
      const sum = stats[key].scores.reduce((a, b) => a + b, 0);
      stats[key].avgScore = sum / stats[key].scores.length;
    }
    delete (stats[key] as any).scores;
  });
  
  return stats as Record<string, { count: number; avgScore?: number; totalViews: number }>;
}

// Bulk operations - useful for clearing specific sub-types
export function clearHistoryBySubType(
  type: HistoryItemType,
  subType: HistorySubType,
  projectId?: string
): number {
  const db = load();
  const initialCount = db.items.length;
  
  db.items = db.items.filter(item => {
    if (item.type !== type) return true;
    if (item.subType !== subType) return true;
    if (projectId && item.metadata.projectId !== projectId) return true;
    return false;
  });
  
  persist();
  return initialCount - db.items.length;
}

// Export all history (for backup/migration)
export function exportHistory(
  filters?: {
    type?: HistoryItemType;
    subType?: HistorySubType;
    projectId?: string;
    fromDate?: string;
    toDate?: string;
  }
): HistoryItem[] {
  const db = load();
  let items = [...db.items];
  
  if (filters) {
    if (filters.type) {
      items = items.filter(i => i.type === filters.type);
    }
    if (filters.subType) {
      items = items.filter(i => i.subType === filters.subType);
    }
    if (filters.projectId) {
      items = items.filter(i => i.metadata.projectId === filters.projectId);
    }
    if (filters.fromDate) {
      items = items.filter(i => i.metadata.generatedAt >= filters.fromDate!);
    }
    if (filters.toDate) {
      items = items.filter(i => i.metadata.generatedAt <= filters.toDate!);
    }
  }
  
  return items;
}

// Import history (with duplicate detection)
export function importHistory(
  items: HistoryItem[],
  options?: {
    skipDuplicates?: boolean;
    replaceExisting?: boolean;
  }
): { imported: number; skipped: number; replaced: number } {
  const db = load();
  let imported = 0;
  let skipped = 0;
  let replaced = 0;
  
  items.forEach(item => {
    const existingIndex = db.items.findIndex(i => i.id === item.id);
    
    if (existingIndex >= 0) {
      if (options?.replaceExisting) {
        db.items[existingIndex] = item;
        replaced++;
      } else if (options?.skipDuplicates) {
        skipped++;
      } else {
        // Default: create new with new ID
        db.items.unshift({ ...item, id: randomUUID() });
        imported++;
      }
    } else {
      db.items.unshift(item);
      imported++;
    }
  });
  
  persist();
  return { imported, skipped, replaced };
}

import { Router } from 'express';
import {
  getHistory,
  getHistoryItem,
  updateHistoryItem,
  deleteHistoryItem,
  clearHistory,
  getHistoryStats,
  toggleFavorite,
  updateQuizScore,
  searchHistory,
  recordView,
  getHistoryBySubType,
  getRecentBySubType,
  getMostViewed,
  getStatsBySubType,
  clearHistoryBySubType,
  exportHistory,
  importHistory,
  addDraftHistoryItem,
  type HistoryItemType,
  type HistorySubType
} from '../db/history.js';

const router = Router();

// Get history with optional filters
router.get('/', (req, res) => {
  try {
    const filters: any = {};
    
    if (req.query.type) {
      filters.type = Array.isArray(req.query.type) 
        ? req.query.type as HistoryItemType[]
        : (req.query.type as string).split(',') as HistoryItemType[];
    }
    if (req.query.subType) {
      filters.subType = Array.isArray(req.query.subType)
        ? req.query.subType as HistorySubType[]
        : (req.query.subType as string).split(',') as HistorySubType[];
    }
    if (req.query.projectId) filters.projectId = req.query.projectId as string;
    if (req.query.subject) filters.subject = req.query.subject as string;
    if (req.query.topic) filters.topic = req.query.topic as string;
    if (req.query.collection) filters.collection = req.query.collection as string;
    if (req.query.scope === 'studio' || req.query.scope === 'notes') filters.scope = req.query.scope;
    if (req.query.isFavorite !== undefined) {
      filters.isFavorite = req.query.isFavorite === 'true';
    }
    if (req.query.limit) filters.limit = parseInt(req.query.limit as string);
    if (req.query.offset) filters.offset = parseInt(req.query.offset as string);
    
    const result = getHistory(filters);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Create a draft history item (for pre-generation navigation)
router.post('/draft', (req, res) => {
  try {
    const { type, subType, title, prompt, source, scope, status } = req.body;
    if (!type) return res.status(400).json({ error: 'type is required' });
    const item = addDraftHistoryItem({ type, subType, title, prompt, source, scope, status });
    res.json({ id: item.id });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Get single history item
router.get('/:id', (req, res) => {
  try {
    const item = getHistoryItem(req.params.id);
    if (!item) {
      return res.status(404).json({ error: 'History item not found' });
    }
    res.json(item);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Update history item
router.patch('/:id', (req, res) => {
  try {
    const item = updateHistoryItem(req.params.id, req.body);
    if (!item) {
      return res.status(404).json({ error: 'History item not found' });
    }
    res.json(item);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Delete history item
router.delete('/:id', (req, res) => {
  try {
    const success = deleteHistoryItem(req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'History item not found' });
    }
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Toggle favorite
router.post('/:id/favorite', (req, res) => {
  try {
    const isFavorite = toggleFavorite(req.params.id);
    res.json({ isFavorite });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Update quiz score
router.post('/:id/score', (req, res) => {
  try {
    const item = updateQuizScore(req.params.id, req.body);
    if (!item) {
      return res.status(404).json({ error: 'History item not found or not a quiz' });
    }
    res.json(item);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Search history
router.get('/search/query', (req, res) => {
  try {
    const query = req.query.q as string;
    if (!query) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }
    
    const filters: any = {};
    if (req.query.type) {
      filters.type = Array.isArray(req.query.type) 
        ? req.query.type as HistoryItemType[]
        : (req.query.type as string).split(',') as HistoryItemType[];
    }
    if (req.query.projectId) filters.projectId = req.query.projectId as string;
    
    const results = searchHistory(query, filters);
    res.json({ results, total: results.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Get history statistics
router.get('/stats/summary', (req, res) => {
  try {
    const projectId = req.query.projectId as string | undefined;
    const stats = getHistoryStats(projectId);
    res.json(stats);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Clear history
router.post('/clear', (req, res) => {
  try {
    const filters: any = {};
    
    if (req.body.type) {
      filters.type = Array.isArray(req.body.type) 
        ? req.body.type as HistoryItemType[]
        : [req.body.type as HistoryItemType];
    }
    if (req.body.projectId) filters.projectId = req.body.projectId;
    if (req.body.olderThan) filters.olderThan = req.body.olderThan;
    
    const deletedCount = clearHistory(filters);
    res.json({ success: true, deletedCount });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Record a view/usage of an item
router.post('/:id/view', (req, res) => {
  try {
    const timeSpent = req.body.timeSpent ? parseInt(req.body.timeSpent) : undefined;
    const item = recordView(req.params.id, timeSpent);
    if (!item) {
      return res.status(404).json({ error: 'History item not found' });
    }
    res.json(item);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Get history grouped by sub-type (for sectioned views)
router.get('/grouped/:type', (req, res) => {
  try {
    const type = req.params.type as HistoryItemType;
    const projectId = req.query.projectId as string | undefined;
    const grouped = getHistoryBySubType(type, projectId);
    res.json(grouped);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Get recent items by sub-type
router.get('/recent/:type/:subType', (req, res) => {
  try {
    const type = req.params.type as HistoryItemType;
    const subType = req.params.subType as HistorySubType;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    const projectId = req.query.projectId as string | undefined;
    
    const items = getRecentBySubType(type, subType, limit, projectId);
    res.json({ items, total: items.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Get most viewed items
router.get('/most-viewed', (req, res) => {
  try {
    const type = req.query.type as HistoryItemType | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    
    const items = getMostViewed(type, limit);
    res.json({ items, total: items.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Get statistics by sub-type
router.get('/stats/:type/subtypes', (req, res) => {
  try {
    const type = req.params.type as HistoryItemType;
    const projectId = req.query.projectId as string | undefined;
    const stats = getStatsBySubType(type, projectId);
    res.json(stats);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Clear history by sub-type
router.post('/clear-subtype', (req, res) => {
  try {
    const { type, subType, projectId } = req.body;
    
    if (!type || !subType) {
      return res.status(400).json({ error: 'type and subType are required' });
    }
    
    const deletedCount = clearHistoryBySubType(
      type as HistoryItemType,
      subType as HistorySubType,
      projectId
    );
    
    res.json({ success: true, deletedCount });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Export history
router.post('/export', (req, res) => {
  try {
    const filters = req.body.filters || {};
    const items = exportHistory(filters);
    
    res.json({
      exported: items.length,
      items,
      timestamp: new Date().toISOString()
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Import history
router.post('/import', (req, res) => {
  try {
    const items = req.body.items;
    const options = req.body.options || {};
    
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'items array is required' });
    }
    
    const result = importHistory(items, options);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;

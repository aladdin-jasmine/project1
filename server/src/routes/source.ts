import { Router } from 'express';
import { logger } from '../util/logger.js';

const router = Router();

// Web scraping endpoint - fetches content from public URLs
router.post('/fetch', async (req, res) => {
  try {
    const { url } = req.body || {};
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Validate URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return res.status(400).json({ error: 'Only HTTP(S) URLs are supported' });
      }
    } catch {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    logger.info(`Fetching URL: ${url}`);

    // Fetch the page content
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      return res.status(400).json({ 
        error: `Failed to fetch URL: HTTP ${response.status} ${response.statusText}` 
      });
    }

    const html = await response.text();
    
    // Extract text content from HTML
    const text = extractTextFromHtml(html);
    
    if (!text || text.length < 50) {
      return res.status(400).json({ 
        error: 'Could not extract meaningful content from this URL. The page may require login or JavaScript.' 
      });
    }

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : parsedUrl.hostname;

    logger.info(`Successfully fetched ${url}: ${text.length} chars`);

    res.json({ 
      content: text, 
      title, 
      url: parsedUrl.toString(),
      length: text.length 
    });
  } catch (e: any) {
    if (e.name === 'TimeoutError' || e.code === 'ETIMEDOUT') {
      return res.status(408).json({ error: 'Request timed out. The site may be slow or blocked.' });
    }
    logger.error('Source fetch error:', e.message);
    res.status(500).json({ error: `Failed to fetch content: ${e.message}` });
  }
});

// Validate if a URL is publicly accessible
router.post('/validate', async (req, res) => {
  try {
    const { url } = req.body || {};
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    
    try {
      new URL(url);
    } catch {
      return res.json({ valid: false, reason: 'Invalid URL format' });
    }

    const response = await fetch(url, { 
      method: 'HEAD',
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    res.json({ 
      valid: response.ok,
      status: response.status,
      contentType: response.headers.get('content-type'),
      reason: response.ok ? undefined : `HTTP ${response.status}`
    });
  } catch (e: any) {
    res.json({ valid: false, reason: e.message });
  }
});

function extractTextFromHtml(html: string): string {
  // Remove script and style elements
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ');
  text = text.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, ' ');
  text = text.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, ' ');
  text = text.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, ' ');
  
  // Replace common block elements with newlines
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<\/h[1-6]>/gi, '\n');
  text = text.replace(/<\/li>/gi, '\n');
  text = text.replace(/<\/tr>/gi, '\n');
  
  // Strip remaining HTML tags
  text = text.replace(/<[^>]+>/g, ' ');
  
  // Decode HTML entities
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, ' ');
  
  // Collapse whitespace
  text = text.replace(/\s+/g, ' ').trim();
  
  // Split into paragraphs by double newlines
  const lines = text.split(/\n+/).filter(l => l.trim().length > 20);
  
  return lines.join('\n\n');
}

export default router;

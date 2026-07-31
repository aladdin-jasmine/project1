import { chatText } from '../llm/client.js';
import type { LanePool } from '../llm/lanes.js';
import type { TaskType } from '../types.js';
import { retrieve } from '../rag/retrieve.js';
import { getChunksByDoc } from '../rag/vectorstore.js';

export interface StudySource {
  type: 'doc' | 'text' | 'topic' | 'web' | 'mixed' | 'multi';
  value?: string; // for text / topic / goal
  docId?: string; // for doc
  docIds?: string[]; // for multiple docs in mixed/multi mode
  urls?: string[]; // for web scraping
  customText?: string; // for additional custom text
  useAllDocs?: boolean; // flag to use all KB documents
}

export interface GenRequest {
  projectId?: string;
  model?: string;
  providerId?: string;
  taskType?: TaskType;
  source: StudySource;
}

// Context budget — balances quality with token limits (Groq free tier: 12000 TPM).
// Most models have 8k-128k context windows; 15000 chars (~5k tokens) avoids rate limits.
const BUDGET = 15000;

// Scrape content from a web URL (public pages only)
async function scrapeWebContent(url: string): Promise<string> {
  try {
    // Validate URL
    const validUrl = new URL(url);
    const hostname = validUrl.hostname.toLowerCase();
    
    // Only allow specific public educational domains for safety
    const allowedDomains = [
      'wikipedia.org',
      'geeksforgeeks.org',
      'stackoverflow.com',
      'github.com',
      'medium.com',
      'dev.to',
      'arxiv.org',
      'scholar.google.com',
      'w3schools.com',
      'mdn.mozilla.org',
      'tutorialspoint.com',
      'javatpoint.com',
      'programiz.com',
      'freecodecamp.org',
      'codecademy.com',
      'khanacademy.org',
      'coursera.org',
      'edx.org',
      'udacity.com'
    ];
    
    const isAllowed = allowedDomains.some(domain => hostname.includes(domain));
    
    if (!isAllowed) {
      return `[Web scraping is restricted to educational domains. URL "${url}" is not in the allowed list.]`;
    }
    
    // Fetch with timeout and user-agent
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'StudyForge Educational Bot/1.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });
    
    clearTimeout(timeout);
    
    if (!response.ok) {
      return `[Failed to fetch ${url}: ${response.status} ${response.statusText}]`;
    }
    
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      return `[Unsupported content type: ${contentType}]`;
    }
    
    const html = await response.text();
    
    // Simple HTML to text conversion (remove scripts, styles, extract text)
    let text = html
      // Remove script and style tags with their content
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      // Remove HTML comments
      .replace(/<!--[\s\S]*?-->/g, '')
      // Remove HTML tags but keep content
      .replace(/<[^>]+>/g, ' ')
      // Decode common HTML entities
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      // Clean up whitespace
      .replace(/\s+/g, ' ')
      .trim();
    
    // Limit to reasonable length
    if (text.length > 15000) {
      text = text.slice(0, 15000) + '... [content truncated]';
    }
    
    return text || '[No text content found]';
    
  } catch (error: any) {
    if (error.name === 'AbortError') {
      return `[Request timeout for ${url}]`;
    }
    return `[Error scraping ${url}: ${error.message}]`;
  }
}

export async function getContext(source: StudySource): Promise<string> {
  const contexts: string[] = [];
  
  // Handle simple single-source types
  if (source.type === 'text' && source.value) {
    return source.value.slice(0, BUDGET);
  }
  
  if (source.type === 'doc' && source.docId) {
    const chunks = getChunksByDoc(source.docId);
    return chunks.map((c) => c.text).join('\n\n').slice(0, BUDGET);
  }
  
  if (source.type === 'topic' && source.value) {
    const chunks = await retrieve(source.value, 8);
    return chunks.map((c) => c.text).join('\n\n').slice(0, BUDGET);
  }
  
  // Handle web scraping
  if (source.type === 'web' && source.urls && source.urls.length > 0) {
    for (const url of source.urls.slice(0, 3)) { // Limit to 3 URLs
      const content = await scrapeWebContent(url);
      if (content && !content.startsWith('[')) { // Skip error messages
        contexts.push(`\n--- Content from ${url} ---\n${content}`);
      }
    }
    return contexts.join('\n\n').slice(0, BUDGET);
  }
  
  // Handle multi-doc sources (all docs or specific docIds)
  if (source.type === 'multi' || source.type === 'mixed') {
    // 1. Custom text
    if (source.customText) {
      contexts.push(`--- Custom Text ---\n${source.customText}`);
    }
    
    // 2. Topic-based retrieval
    if (source.value) {
      const chunks = await retrieve(source.value, 8);
      if (chunks.length > 0) {
        contexts.push(`--- Retrieved Knowledge (topic: "${source.value}") ---\n${chunks.map(c => c.text).join('\n\n')}`);
      }
    }
    
    // 3. Specific documents (up to 5, or all if useAllDocs)
    if (source.docIds && source.docIds.length > 0) {
      const limit = source.useAllDocs ? source.docIds.length : Math.min(source.docIds.length, 5);
      for (const docId of source.docIds.slice(0, limit)) {
        const chunks = getChunksByDoc(docId);
        if (chunks.length > 0) {
          contexts.push(`--- Document content ---\n${chunks.map(c => c.text).join('\n\n')}`);
        }
      }
    }
    
    // 4. Web content
    if (source.urls && source.urls.length > 0) {
      for (const url of source.urls.slice(0, 2)) {
        const content = await scrapeWebContent(url);
        if (content && !content.startsWith('[')) {
          contexts.push(`--- Web Source: ${url} ---\n${content}`);
        }
      }
    }
    
    const joined = contexts.join('\n\n');
    return joined.length > BUDGET * 2
      ? joined.slice(0, BUDGET * 2) + '\n\n[content truncated — source material exceeded the context budget]'
      : joined;
  }
  
  return '';
}

export function parseJSON(text: string): any {
  let t = text.trim();

  // Remove markdown code fences
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();

  // Find JSON object or array boundaries
  const firstObj = t.indexOf('{');
  const firstArr = t.indexOf('[');
  const start = Math.min(firstObj === -1 ? Infinity : firstObj, firstArr === -1 ? Infinity : firstArr);

  if (start === Infinity) {
    throw new Error('No JSON found in response');
  }

  // Find matching closing bracket
  let depth = 0;
  let inString = false;
  let escapeNext = false;
  const startChar = t[start];
  const endChar = startChar === '{' ? '}' : ']';
  let end = -1;

  for (let i = start; i < t.length; i++) {
    const char = t[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      escapeNext = true;
      continue;
    }

    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === startChar) {
      depth++;
    } else if (char === endChar) {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  if (end !== -1 && end > start) {
    return JSON.parse(t.slice(start, end + 1));
  }

  // Unbalanced: the model was cut off at its output cap. Rather than lose the
  // whole response, close the open containers and keep what did arrive.
  return JSON.parse(repairTruncatedJSON(t.slice(start)));
}

/**
 * Close a JSON fragment that ends mid-structure. Any trailing partial literal is
 * dropped, then open strings/arrays/objects are terminated in reverse order so
 * the completed items in the fragment survive.
 */
export function repairTruncatedJSON(fragment: string): string {
  const stack: string[] = [];
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < fragment.length; i++) {
    const ch = fragment[i];
    if (escapeNext) { escapeNext = false; continue; }
    if (ch === '\\') { escapeNext = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{' || ch === '[') stack.push(ch === '{' ? '}' : ']');
    else if (ch === '}' || ch === ']') stack.pop();
  }

  let out = fragment;
  if (inString) {
    // Truncated inside a string literal: terminate it so the value survives.
    out += '"';
  }

  // Drop any trailing fragment that cannot form a complete value:
  // a dangling `"key":`, a lone `"key"`, or a trailing comma.
  for (let i = 0; i < 3; i++) {
    out = out.replace(/\s+$/, '');
    const trimmed = out
      .replace(/,?\s*"(?:[^"\\]|\\.)*"\s*:\s*$/, '')
      .replace(/,\s*$/, '');
    if (trimmed === out) break;
    out = trimmed;
  }

  while (stack.length) out += stack.pop();
  return out;
}

/**
 * How a prompt reaches a model. The default runs through the failover chat
 * client; a lane-backed one runs on a specific (key, model) lane so many units
 * can be generated at once. Study generators take this as a parameter so the
 * same prompt code works serially or in parallel.
 */
export type CompletionFn = (args: {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
}) => Promise<string>;

/** Route completions through a lane pool so callers can run many concurrently. */
export function poolCompletion(pool: LanePool): CompletionFn {
  return async ({ system, user, temperature, maxTokens }) => {
    const r = await pool.exec({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      temperature: temperature ?? 0.5,
      maxTokens
    });
    return r.content;
  };
}

export function defaultCompletion(req: GenRequest): CompletionFn {
  return ({ system, user, temperature, maxTokens }) =>
    chatText({
      projectId: req.projectId,
      providerId: req.providerId,
      model: req.model,
      taskType: req.taskType,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      temperature: temperature ?? 0.5,
      maxTokens
    });
}

// Generate structured JSON from the LLM with one self-correction retry.
export async function generateJSON(
  system: string,
  userPrompt: string,
  req: GenRequest,
  schemaHint: string,
  maxTokens = 8000,
  complete?: CompletionFn
): Promise<any> {
  const run = complete || defaultCompletion(req);
  const user = `${userPrompt}\n\nIMPORTANT:
1. ONLY use material that is DIRECTLY RELEVANT to the requested topic. IGNORE any provided content about unrelated subjects.
2. Prefer the provided relevant material. Where it is silent or absent, use your own expert knowledge — never answer "no information available".
3. Write DETAILED, THOROUGH responses. Cover every important concept. Provide examples, explanations, and complete coverage.
4. Quality over brevity — each answer should be comprehensive and exam-ready.
5. Output MUST be complete, parseable JSON. Never stop mid-structure; if space is tight, produce fewer items rather than an unfinished one.\n\nReturn ONLY valid JSON matching this shape (no prose, no markdown fences):\n${schemaHint}`;

  const content = await run({ system, user, temperature: 0.5, maxTokens });
  try {
    return parseJSON(content);
  } catch (e) {
    // A malformed body is usually a cut-off body. Re-asking a model with the same
    // cap to reprint it fails the same way, so salvage the fragment instead.
    try {
      return parseJSON(`${content}`.slice(`${content}`.search(/[[{]/)));
    } catch {
      const fixed = await run({
        system: 'You fix malformed JSON. Reply with only valid JSON.',
        user: `The previous output was not valid JSON. Fix and return only valid JSON:\n${content}`,
        temperature: 0.2,
        maxTokens
      });
      return parseJSON(fixed);
    }
  }
}

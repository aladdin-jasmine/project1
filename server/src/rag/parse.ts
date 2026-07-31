import mammoth from 'mammoth';
import jszip from 'jszip';
import { logger } from '../util/logger.js';

export interface ExtractResult {
  text: string;
  pages?: string[]; // per-page text (PDF only) — enables accurate page citations
  pageCount?: number;
  imageHeavy?: boolean; // true when pdf-parse yields almost no text (scanned PDF)
}

// Generic single-string extraction (non-PDF, or PDF when per-page not needed).
export async function extractText(buffer: Buffer, type: string): Promise<string> {
  const r = await extract(buffer, type);
  return r.text;
}

// Full extraction with optional per-page breakdown.
export async function extract(buffer: Buffer, type: string): Promise<ExtractResult> {
  const t = type.toLowerCase();
  if (t === 'pdf') return extractPdf(buffer);
  if (t === 'docx') {
    const r = await mammoth.extractRawText({ buffer });
    return { text: r.value || '' };
  }
  if (t === 'pptx') return extractPptx(buffer);
  // txt, md, csv, json, etc.
  return { text: buffer.toString('utf-8') };
}

// Per-page PDF text extraction via pdfjs-dist v4 (legacy build runs in Node
// without a worker). Falls back to a crude ASCII scrape if pdfjs is unavailable.
async function extractPdf(buffer: Buffer): Promise<ExtractResult> {
  try {
    const pdfjsLib: any = await import('pdfjs-dist/legacy/build/pdf.mjs').catch(() => null);
    if (!pdfjsLib) {
      const t = buffer.toString('latin1').replace(/[^\x20-\x7E\n\r]/g, ' ');
      return { text: t, pageCount: 1, imageHeavy: true };
    }
    const { fileURLToPath } = await import('url');
    const { dirname, resolve } = await import('path');
    const here = dirname(fileURLToPath(import.meta.url));
    const fontUrl = resolve(here, '../../../node_modules/pdfjs-dist/standard_fonts/');
    const doc = await pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      disableWorker: true,
      standardFontDataUrl: fontUrl
    }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const str = (content.items || []).map((it: any) => it.str || '').join(' ');
      pages.push(str);
    }
    const text = pages.join('\n\n');
    const imageHeavy = text.replace(/\s/g, '').length < 60;
    return { text, pages, pageCount: pages.length, imageHeavy };
  } catch (e: any) {
    logger.warn('PDF text extraction failed:', e?.message || e);
    const t = buffer.toString('latin1').replace(/[^\x20-\x7E\n\r]/g, ' ');
    return { text: t, pageCount: 1, imageHeavy: true };
  }
}

async function extractPptx(buffer: Buffer): Promise<ExtractResult> {
  const zip = await jszip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => {
      const na = parseInt(a.match(/slide(\d+)\.xml$/)![1], 10);
      const nb = parseInt(b.match(/slide(\d+)\.xml$/)![1], 10);
      return na - nb;
    });
  const slides: string[] = [];
  for (const f of slideFiles) {
    const xml = await zip.files[f].async('string');
    // Pull <a:t> text runs
    const texts: string[] = [];
    const re = /<a:t[^>]*>([\s\S]*?)<\/a:t>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml))) texts.push(decodeXml(m[1]));
    slides.push(texts.join(' '));
  }
  // notes (optional)
  return { text: slides.join('\n\n'), pages: slides, pageCount: slides.length };
}

function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

// Light cleaning for chunking.
export function cleanText(text: string): string {
  return text
    .replace(//g, '\n')
    .replace(/ /g, ' ')
    .replace(/[ 	]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Detect heading-like lines (short, title-ish).
export function isHeading(line: string): boolean {
  const l = line.trim();
  if (l.length < 3 || l.length > 90) return false;
  if (/^[0-9]+[.)]?\s/.test(l)) return true; // "1.2 Title" or "3) Title"
  const words = l.split(/\s+/);
  if (words.length > 12) return false;
  const upper = (l.match(/[A-Z]/g) || []).length;
  const letters = (l.match(/[A-Za-z]/g) || []).length;
  // Either mostly capitals, or ends without terminal punctuation (title-like)
  return letters > 0 && (upper / letters > 0.5 || !/[.!?:,]$/.test(l));
}
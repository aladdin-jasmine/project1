import { logger } from '../util/logger.js';

export interface OcrResult {
  text: string;
  pages: number;
}

// Best-effort OCR for scanned / image-only PDFs.
// Uses pdfjs-dist (to read embedded page images) + pngjs (encode PNG) + tesseract.js (OCR).
// Everything is dynamically imported and wrapped so a missing native dependency or
// runtime error degrades to null — the caller then falls back to text-only extraction.
export async function ocrPdf(buffer: Buffer): Promise<OcrResult | null> {
  try {
    const pdfjsLib: any = await import('pdfjs-dist/legacy/build/pdf.mjs').catch(() => null);
    const { PNG }: any = await import('pngjs').catch(() => ({ PNG: null }));
    const Tesseract: any = await import('tesseract.js').catch(() => null);
    if (!pdfjsLib || !PNG || !Tesseract) {
      logger.warn('OCR libs unavailable (pdfjs/pngjs/tesseract); skipping OCR.');
      return null;
    }

    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer), disableWorker: true }).promise;
    let out = '';
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const ops = await page.getOperatorList();
      const imageNames = new Set<string>();
      for (let j = 0; j < ops.fnArray.length; j++) {
        if (ops.fnArray[j] === pdfjsLib.OPS.paintImageXObject) {
          imageNames.add(ops.argsArray[j][0]);
        }
      }
      for (const name of imageNames) {
        const obj = page.objs.get(name);
        if (!obj || !obj.width || !obj.height || !obj.data) continue;
        const png = new PNG({ width: obj.width, height: obj.height });
        for (let p = 0; p < obj.data.length; p++) png.data[p] = obj.data[p];
        const buf = PNG.sync.write(png);
        const { data } = await Tesseract.recognize(buf, 'eng', { logger: () => {} });
        out += `\n${data.text || ''}\n`;
      }
    }
    if (!out.trim()) return null;
    return { text: out.trim(), pages: doc.numPages };
  } catch (e: any) {
    logger.warn('OCR failed, falling back to text extraction:', e?.message || e);
    return null;
  }
}

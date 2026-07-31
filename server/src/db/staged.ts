import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { DATA_DIR, ensureDataDir } from './store.js';

const STAGED_DIR = resolve(DATA_DIR, 'staged');

export interface StagedFile {
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

function ensureStagedDir() {
  ensureDataDir();
  if (!existsSync(STAGED_DIR)) mkdirSync(STAGED_DIR, { recursive: true });
}

export function saveStaged(buffer: Buffer, fileName: string, type: string, metadata: StagedFile['metadata']): StagedFile {
  ensureStagedDir();
  const id = randomUUID();
  const file: StagedFile = {
    id,
    fileName,
    type,
    size: buffer.length,
    uploadedAt: new Date().toISOString(),
    metadata
  };
  writeFileSync(resolve(STAGED_DIR, `${id}.bin`), buffer);
  writeFileSync(resolve(STAGED_DIR, `${id}.meta.json`), JSON.stringify(file, null, 2));
  return file;
}

export function getStagedFile(id: string): { buffer: Buffer; meta: StagedFile } | null {
  ensureStagedDir();
  const metaPath = resolve(STAGED_DIR, `${id}.meta.json`);
  const binPath = resolve(STAGED_DIR, `${id}.bin`);
  if (!existsSync(metaPath) || !existsSync(binPath)) return null;
  return {
    buffer: readFileSync(binPath),
    meta: JSON.parse(readFileSync(metaPath, 'utf-8'))
  };
}

export function listStaged(): StagedFile[] {
  ensureStagedDir();
  const files = readdirSync(STAGED_DIR).filter(f => f.endsWith('.meta.json'));
  return files.map(f => {
    try {
      return JSON.parse(readFileSync(resolve(STAGED_DIR, f), 'utf-8')) as StagedFile;
    } catch { return null; }
  }).filter(Boolean) as StagedFile[];
}

export function deleteStaged(id: string): boolean {
  ensureStagedDir();
  const metaPath = resolve(STAGED_DIR, `${id}.meta.json`);
  const binPath = resolve(STAGED_DIR, `${id}.bin`);
  let found = false;
  if (existsSync(metaPath)) { unlinkSync(metaPath); found = true; }
  if (existsSync(binPath)) { unlinkSync(binPath); found = true; }
  return found;
}

export function clearAllStaged(): number {
  ensureStagedDir();
  const files = readdirSync(STAGED_DIR).filter(f => f.endsWith('.bin') || f.endsWith('.meta.json'));
  for (const f of files) unlinkSync(resolve(STAGED_DIR, f));
  return files.length;
}

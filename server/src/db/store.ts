import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// server/src/db -> repo root (folder-project)
export const ROOT = resolve(__dirname, '../../..');
export const DATA_DIR = resolve(ROOT, 'data');

export function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

export function readJson<T>(name: string, fallback: T): T {
  ensureDataDir();
  const file = resolve(DATA_DIR, `${name}.json`);
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(readFileSync(file, 'utf-8')) as T;
  } catch (e) {
    console.error(`Failed to read ${name}.json, using fallback`, e);
    return fallback;
  }
}

export function writeJson(name: string, data: unknown): void {
  ensureDataDir();
  const file = resolve(DATA_DIR, `${name}.json`);
  const tmp = resolve(DATA_DIR, `.${name}.tmp.json`);
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, file); // atomic replace
}

// Resolve an absolute path inside the data dir (used for uploads / vector subfiles)
export function dataPath(...segments: string[]): string {
  return resolve(DATA_DIR, ...segments);
}

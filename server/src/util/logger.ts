// Enhanced logger with file output for debugging
import { existsSync, mkdirSync, appendFileSync, writeFileSync, readdirSync, statSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { DATA_DIR } from '../db/store.js';

const LOGS_DIR = resolve(DATA_DIR, 'logs');
const MAX_LOG_FILES = 30;
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB per file

function ensureLogsDir() {
  if (!existsSync(LOGS_DIR)) mkdirSync(LOGS_DIR, { recursive: true });
}

function currentLogFile(): string {
  ensureLogsDir();
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return resolve(LOGS_DIR, `${date}.log`);
}

function rotateLogs() {
  try {
    ensureLogsDir();
    const files = readdirSync(LOGS_DIR)
      .filter(f => f.endsWith('.log'))
      .map(f => ({ name: f, time: statSync(resolve(LOGS_DIR, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time);

    // Remove old files beyond retention
    if (files.length > MAX_LOG_FILES) {
      files.slice(MAX_LOG_FILES).forEach(f => {
        try { appendFileSync(resolve(LOGS_DIR, '.rotating'), ''); } catch {}
      });
    }

    // Rotate current file if too large
    const current = currentLogFile();
    if (existsSync(current) && statSync(current).size > MAX_LOG_SIZE) {
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const rotated = resolve(LOGS_DIR, `${new Date().toISOString().split('T')[0]}-${ts}.log`);
      try {
        const content = readFileSync(current, 'utf-8');
        writeFileSync(rotated, content);
        writeFileSync(current, '');
      } catch {}
    }
  } catch (e) {
    // Silently fail rotation
  }
}

const ts = () => new Date().toISOString();

function format(level: string, args: any[]): string {
  const msg = args.map(a => {
    if (typeof a === 'string') return a;
    if (a instanceof Error) return `${a.message}\n${a.stack || ''}`;
    if (typeof a === 'object') {
      try { return JSON.stringify(a, null, 2); } catch { return String(a); }
    }
    return String(a);
  }).join(' ');
  return `[${ts()}] [${level}] ${msg}\n`;
}

function write(level: string, args: any[]) {
  try {
    rotateLogs();
    const file = currentLogFile();
    appendFileSync(file, format(level, args));
  } catch (e) {
    // Silently fail file write
  }
}

export const logger = {
  info: (...a: any[]) => { console.log(`\x1b[36m[INFO] ${ts()}\x1b[0m`, ...a); write('INFO', a); },
  warn: (...a: any[]) => { console.warn(`\x1b[33m[WARN] ${ts()}\x1b[0m`, ...a); write('WARN', a); },
  error: (...a: any[]) => { console.error(`\x1b[31m[ERROR] ${ts()}\x1b[0m`, ...a); write('ERROR', a); },
  debug: (...a: any[]) => { console.debug(`\x1b[90m[DEBUG] ${ts()}\x1b[0m`, ...a); write('DEBUG', a); },
  // Structured action logging for easy debugging
  action: (action: string, details?: any) => {
    const msg = `[ACTION] ${action}${details ? ' | ' + JSON.stringify(details) : ''}`;
    console.log(`\x1b[35m[INFO] ${ts()}\x1b[0m ${msg}`);
    write('ACTION', [msg]);
  }
};

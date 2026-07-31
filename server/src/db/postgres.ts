import { Pool } from 'pg';
import { logger } from '../util/logger.js';

// Optional PostgreSQL layer. When DATABASE_URL is set AND reachable, we mirror
// analytics/audit events there. When it is missing or unreachable, every call
// degrades silently and the app continues using the local JSON store.

let pool: Pool | null = null;
let tried = false;
let ready = false;

function url(): string | undefined {
  return process.env.DATABASE_URL || undefined;
}

export function pgIsReady(): boolean {
  return ready;
}

async function connect(): Promise<boolean> {
  if (tried) return ready;
  tried = true;
  const u = url();
  if (!u) return false;
  try {
    pool = new Pool({ connectionString: u, max: 4, idleTimeoutMillis: 30000 });
    await pool.query('SELECT 1');
    await ensureSchema();
    ready = true;
    logger.info('PostgreSQL connected — relational analytics enabled.');
  } catch (e: any) {
    logger.warn('PostgreSQL unavailable, using local JSON store:', e?.message || e);
    ready = false;
    pool = null;
  }
  return ready;
}

async function ensureSchema(): Promise<void> {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id SERIAL PRIMARY KEY,
      type TEXT NOT NULL,
      topic TEXT,
      correct INTEGER DEFAULT 0,
      incorrect INTEGER DEFAULT 0,
      ts TIMESTAMPTZ DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_log (
      id SERIAL PRIMARY KEY,
      session_id TEXT,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      ts TIMESTAMPTZ DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      name TEXT,
      type TEXT,
      collection TEXT DEFAULT 'kb',
      size INTEGER,
      chunks INTEGER,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);
}

// Run a write query; ignore failures (graceful).
export async function pgRun(sql: string, params: any[] = []): Promise<void> {
  if (!(await connect())) return;
  try {
    await pool!.query(sql, params);
  } catch (e: any) {
    logger.warn('pgRun failed:', e?.message || e);
  }
}

// Run a read query; returns [] on failure.
export async function pgAll<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  if (!(await connect())) return [];
  try {
    const r = await pool!.query(sql, params);
    return r.rows as T[];
  } catch (e: any) {
    return [];
  }
}

// Convenience helpers used by the app
export async function logActivity(type: string, topic?: string, correct = 0, incorrect = 0): Promise<void> {
  await pgRun(
    'INSERT INTO activity_log (type, topic, correct, incorrect) VALUES ($1,$2,$3,$4)',
    [type, topic || null, correct, incorrect]
  );
}
export async function logChat(sessionId: string | undefined, role: string, content: string): Promise<void> {
  await pgRun('INSERT INTO chat_log (session_id, role, content) VALUES ($1,$2,$3)', [
    sessionId || null,
    role,
    content.slice(0, 2000)
  ]);
}
export async function logDocument(d: {
  id: string;
  name: string;
  type: string;
  collection: string;
  size: number;
  chunks: number;
}): Promise<void> {
  await pgRun(
    `INSERT INTO documents (id, name, type, collection, size, chunks)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (id) DO UPDATE SET name=$2, chunks=$6, collection=$4`,
    [d.id, d.name, d.type, d.collection, d.size, d.chunks]
  );
}

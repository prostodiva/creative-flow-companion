import { createRequire } from 'node:module';
import { chmod, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { config } from './config.js';
import { logger } from './logger.js';
import { dbQueryDuration } from './metrics.js';

// @journeyapps/sqlcipher is CommonJS; use require in ESM context
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sqlite3: any = require('@journeyapps/sqlcipher').verbose();

// ---- Public interface -------------------------------------------------------

export interface DB {
  run(sql: string, params?: unknown[]): Promise<void>;
  get<T = unknown>(sql: string, params?: unknown[]): Promise<T | undefined>;
  all<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

// ---- Low-level promise wrappers --------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function promiseRun(db: any, sql: string, params: unknown[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (this: unknown, err: Error | null) {
      if (err) reject(err);
      else resolve();
    });
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function promiseGet<T>(db: any, sql: string, params: unknown[] = []): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err: Error | null, row: T) => {
      if (err) reject(err);
      else resolve(row ?? undefined);
    });
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function promiseAll<T>(db: any, sql: string, params: unknown[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err: Error | null, rows: T[]) => {
      if (err) reject(err);
      else resolve(rows ?? []);
    });
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function promiseClose(db: any): Promise<void> {
  return new Promise((resolve, reject) => {
    db.close((err: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// ---- Metrics-wrapped public DB ---------------------------------------------

function wrapWithMetrics(raw: {
  run: (sql: string, params?: unknown[]) => Promise<void>;
  get: <T>(sql: string, params?: unknown[]) => Promise<T | undefined>;
  all: <T>(sql: string, params?: unknown[]) => Promise<T[]>;
  close: () => Promise<void>;
}): DB {
  const time = (op: string) => dbQueryDuration.startTimer({ operation: op });
  return {
    async run(sql, params) {
      const end = time('run');
      try { await raw.run(sql, params); } finally { end(); }
    },
    async get<T>(sql: string, params?: unknown[]) {
      const end = time('get');
      try { return await raw.get<T>(sql, params); } finally { end(); }
    },
    async all<T>(sql: string, params?: unknown[]) {
      const end = time('all');
      try { return await raw.all<T>(sql, params); } finally { end(); }
    },
    close: () => raw.close(),
  };
}

// ---- DDL -------------------------------------------------------------------

async function createSchema(db: DB): Promise<void> {
  await db.run(`
    CREATE TABLE IF NOT EXISTS app_activity (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ts          INTEGER NOT NULL,
      app         TEXT    NOT NULL,
      title       TEXT    NOT NULL,
      duration_ms INTEGER NOT NULL
    )
  `);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_app_ts ON app_activity(ts)`);

  await db.run(`
    CREATE TABLE IF NOT EXISTS ide_events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ts          INTEGER NOT NULL,
      ide         TEXT    NOT NULL,
      project     TEXT    NOT NULL,
      file        TEXT    NOT NULL,
      language    TEXT    NOT NULL,
      duration_ms INTEGER NOT NULL
    )
  `);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_ide_ts ON ide_events(ts)`);

  await db.run(`
    CREATE TABLE IF NOT EXISTS keystrokes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      ts         INTEGER NOT NULL,
      file       TEXT    NOT NULL,
      event_type TEXT    NOT NULL
    )
  `);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_ks_ts ON keystrokes(ts)`);
}

// ---- Retention cron --------------------------------------------------------

function scheduleRetention(db: DB): NodeJS.Timeout {
  const INTERVAL_MS = 60 * 60 * 1000; // hourly
  const run = async () => {
    const days = config.get().RETENTION_DAYS;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    try {
      await db.run('DELETE FROM app_activity WHERE ts < ?', [cutoff]);
      await db.run('DELETE FROM ide_events WHERE ts < ?', [cutoff]);
      await db.run('DELETE FROM keystrokes WHERE ts < ?', [cutoff]);
      await db.run('VACUUM');
      logger.debug({ cutoff, days }, 'Retention sweep complete');
    } catch (err) {
      logger.error({ err }, 'Retention sweep failed');
    }
  };
  run().catch(() => {});
  return setInterval(run, INTERVAL_MS);
}

// ---- Singleton factory ------------------------------------------------------

let _instance: DB | null = null;
let _retentionTimer: NodeJS.Timeout | null = null;

export async function getDB(): Promise<DB> {
  if (_instance) return _instance;

  const cfg = config.get();
  const dbPath = resolve(cfg.DB_PATH);
  const dir = dirname(dbPath);

  await mkdir(dir, { recursive: true });

  // Open DB
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawDb: any = await new Promise((resolve, reject) => {
    const d = new sqlite3.Database(dbPath, (err: Error | null) => {
      if (err) reject(err);
      else resolve(d);
    });
  });

  const rawOps = {
    run: (sql: string, params?: unknown[]) => promiseRun(rawDb, sql, params),
    get: <T>(sql: string, params?: unknown[]) => promiseGet<T>(rawDb, sql, params),
    all: <T>(sql: string, params?: unknown[]) => promiseAll<T>(rawDb, sql, params),
    close: () => promiseClose(rawDb),
  };

  const db = wrapWithMetrics(rawOps);

  // Security PRAGMAs — key MUST be first
  await rawOps.run(`PRAGMA key = '${cfg.DB_KEY}'`);
  await rawOps.run('PRAGMA secure_delete = ON');
  await rawOps.run('PRAGMA journal_mode = WAL');
  await rawOps.run('PRAGMA foreign_keys = ON');

  // chmod after first open (file now exists)
  try {
    await chmod(dbPath, 0o600);
    await chmod(dir, 0o700);
  } catch {
    /* ignore if file system doesn't support chmod */
  }

  await createSchema(db);

  _retentionTimer = scheduleRetention(db);

  _instance = {
    ...db,
    async close() {
      if (_retentionTimer) clearInterval(_retentionTimer);
      await db.close();
      _instance = null;
    },
  };

  logger.info({ dbPath }, 'Database initialised');
  return _instance;
}
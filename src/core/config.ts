import { EventEmitter } from 'node:events';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

// ---- Schema ----------------------------------------------------------------

const ConfigSchema = z.object({
  DB_KEY: z.string().min(16, 'DB_KEY must be at least 16 characters'),
  DB_PATH: z.string().default('./data/flow.db'),
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),
  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(2000),
  RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  REDACT_PATTERNS: z.string().default('password,secret,token'),
  REDACT_PATHS: z.string().default('/home,/Users'),
  MCP_PORT: z.coerce.number().int().positive().default(3000),
  INTERVENTION_PORT: z.coerce.number().int().positive().default(8001),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

// ---- Manager ---------------------------------------------------------------

class ConfigManager extends EventEmitter {
  private _cfg: AppConfig;
  private _watcher: import('chokidar').FSWatcher | undefined;

  constructor() {
    super();
    this._cfg = this._load();
    this._watchAsync().catch(() => {/* non-critical */});
  }

  private _load(): AppConfig {
    const envPath = resolve(process.cwd(), '.env');
    if (existsSync(envPath)) {
      dotenv.config({ path: envPath, override: true });
    }
    const result = ConfigSchema.safeParse(process.env);
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `  ${i.path.join('.')}: ${i.message}`)
        .join('\n');
      throw new Error(`Invalid configuration:\n${issues}`);
    }
    return result.data;
  }

  private async _watchAsync(): Promise<void> {
    // Lazy-import chokidar so tests don't need the FS watcher
    const { default: chokidar } = await import('chokidar');
    const envPath = resolve(process.cwd(), '.env');
    this._watcher = chokidar.watch(envPath, { ignoreInitial: true });
    this._watcher.on('change', () => {
      try {
        const prev = this._cfg;
        this._cfg = this._load();
        this.emit('change', this._cfg, prev);
      } catch (err) {
        this.emit('error', err);
      }
    });
  }

  get(): AppConfig {
    return this._cfg;
  }

  get redactPatterns(): RegExp[] {
    return this._cfg.REDACT_PATTERNS
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => new RegExp(p, 'gi'));
  }

  get redactPaths(): string[] {
    return this._cfg.REDACT_PATHS
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
  }

  async destroy(): Promise<void> {
    await this._watcher?.close();
  }
}

// Singleton — safe because main.ts is the only entry-point
export const config = new ConfigManager();
import type { DB } from '../core/db.js';

export interface AppActivity {
  id?: number;
  ts: number;
  app: string;
  title: string;
  duration_ms: number;
}

export interface AppSummaryRow {
  app: string;
  total_duration_ms: number;
  event_count: number;
}

export class AppRepo {
  constructor(private readonly db: DB) {}

  async insertMany(rows: Omit<AppActivity, 'id'>[]): Promise<void> {
    for (const row of rows) {
      await this.db.run(
        `INSERT INTO app_activity (ts, app, title, duration_ms)
         VALUES (?, ?, ?, ?)`,
        [row.ts, row.app, row.title, row.duration_ms]
      );
    }
  }

  /**
   * Returns per-app total duration for the given time window.
   */
  async getSummary(
    fromMs: number,
    toMs: number
  ): Promise<AppSummaryRow[]> {
    return this.db.all<AppSummaryRow>(
      `SELECT app,
              SUM(duration_ms) AS total_duration_ms,
              COUNT(*)         AS event_count
       FROM   app_activity
       WHERE  ts BETWEEN ? AND ?
       GROUP  BY app
       ORDER  BY total_duration_ms DESC`,
      [fromMs, toMs]
    );
  }

  /**
   * Returns total duration (ms) in the window for apps NOT in the allowlist.
   */
  async getDistractedDurationMs(
    fromMs: number,
    toMs: number,
    allowedApps: string[]
  ): Promise<number> {
    if (allowedApps.length === 0) {
      const row = await this.db.get<{ total: number }>(
        `SELECT COALESCE(SUM(duration_ms), 0) AS total
         FROM   app_activity
         WHERE  ts BETWEEN ? AND ?`,
        [fromMs, toMs]
      );
      return row?.total ?? 0;
    }

    const placeholders = allowedApps.map(() => '?').join(', ');
    const row = await this.db.get<{ total: number }>(
      `SELECT COALESCE(SUM(duration_ms), 0) AS total
       FROM   app_activity
       WHERE  ts BETWEEN ? AND ?
         AND  app NOT IN (${placeholders})`,
      [fromMs, toMs, ...allowedApps]
    );
    return row?.total ?? 0;
  }

  async getRecentActivity(limitRows: number): Promise<AppActivity[]> {
    return this.db.all<AppActivity>(
      `SELECT * FROM app_activity ORDER BY ts DESC LIMIT ?`,
      [limitRows]
    );
  }
}
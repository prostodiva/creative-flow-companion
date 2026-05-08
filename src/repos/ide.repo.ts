import type { DB } from '../core/db.js';

export interface IdeEvent {
  id?: number;
  ts: number;
  ide: string;
  project: string;
  file: string;
  language: string;
  duration_ms: number;
}

export interface Keystroke {
  id?: number;
  ts: number;
  file: string;
  event_type: string;
}

export interface IdeSummaryRow {
  ide: string;
  project: string;
  total_duration_ms: number;
  event_count: number;
}

export class IdeRepo {
  constructor(private readonly db: DB) {}

  async insertMany(rows: Omit<IdeEvent, 'id'>[]): Promise<void> {
    for (const row of rows) {
      await this.db.run(
        `INSERT INTO ide_events (ts, ide, project, file, language, duration_ms)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [row.ts, row.ide, row.project, row.file, row.language, row.duration_ms]
      );
    }
  }

  async insertKeystroke(row: Omit<Keystroke, 'id'>): Promise<void> {
    await this.db.run(
      `INSERT INTO keystrokes (ts, file, event_type) VALUES (?, ?, ?)`,
      [row.ts, row.file, row.event_type]
    );
  }

  async getSummary(fromMs: number, toMs: number): Promise<IdeSummaryRow[]> {
    return this.db.all<IdeSummaryRow>(
      `SELECT ide,
              project,
              SUM(duration_ms) AS total_duration_ms,
              COUNT(*)         AS event_count
       FROM   ide_events
       WHERE  ts BETWEEN ? AND ?
       GROUP  BY ide, project
       ORDER  BY total_duration_ms DESC`,
      [fromMs, toMs]
    );
  }

  /**
   * Returns total IDE active duration (ms) in the window.
   * Used to detect "stuck" — IDE open but no keystrokes.
   */
  async getIdeDurationMs(fromMs: number, toMs: number): Promise<number> {
    const row = await this.db.get<{ total: number }>(
      `SELECT COALESCE(SUM(duration_ms), 0) AS total
       FROM   ide_events
       WHERE  ts BETWEEN ? AND ?`,
      [fromMs, toMs]
    );
    return row?.total ?? 0;
  }

  async getKeystrokeCount(fromMs: number, toMs: number): Promise<number> {
    const row = await this.db.get<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt
       FROM   keystrokes
       WHERE  ts BETWEEN ? AND ?`,
      [fromMs, toMs]
    );
    return row?.cnt ?? 0;
  }

  async getRecentEvents(limitRows: number): Promise<IdeEvent[]> {
    return this.db.all<IdeEvent>(
      `SELECT * FROM ide_events ORDER BY ts DESC LIMIT ?`,
      [limitRows]
    );
  }
}
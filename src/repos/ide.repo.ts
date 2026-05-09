import type { Database } from "better-sqlite3";
import { loadSql } from "../db/sql.js";
import { getGitDiffSummary, getTodoComments } from "../core/git-intel.js";

export interface IdeEvent {
  ts: number;
  file: string;
  event_type: string;
  project?: string;
}

export interface IdeSummaryRow {
  file: string;
  project: string;
  total_ms: number;
}

export interface ActiveSessionPayload {
  timestamp: number; // Date.now()
  appName: string; // "Code", "Safari", "Chrome" …
  filePath: string; // full path, or "__no_file__" for non-IDE rows
  windowTitle: string; // VSCode window title or browser tab title
  isCoding: 0 | 1; // 1 = VSCode/Xcode, 0 = everything else
  durationMs: number; // poll interval in ms (default 5000)
}

export class IdeRepo {
  private readonly _sql = {
    insertIdeEvent: loadSql("queries/ide/insert_ide_event.sql"),
    getSummary: loadSql("queries/ide/get_summary.sql"),
    getIdeDurationTotal: loadSql("queries/ide/get_ide_duration_total.sql"),
    getKeystrokeCountBetween: loadSql(
      "queries/ide/get_keystroke_count_between.sql",
    ),
    getRecentEvents: loadSql("queries/ide/get_recent_events.sql"),
    getLastCommitTs: loadSql("queries/ide/get_last_commit_ts.sql"),
    getKeystrokeCountSince: loadSql(
      "queries/ide/get_keystroke_count_since.sql",
    ),
    getRecentlyTouchedFiles: loadSql(
      "queries/ide/get_recently_touched_files.sql",
    ),
    upsertLastCommitTs: loadSql("queries/ide/upsert_last_commit_ts.sql"),
    // ── RAG additions ────────────────────────────────────────────────────────
    insertActiveSession: loadSql("queries/ide/insert_active_session.sql"),
    cleanupActiveSessions: loadSql("queries/ide/cleanup_active_sessions.sql"),
  };

  constructor(private db: Database) {}


  insertKeystroke(evt: IdeEvent): void {
    this.db
      .prepare(this._sql.insertIdeEvent)
      .run([evt.ts, evt.file, evt.event_type]);
  }

  insertMany(events: IdeEvent[]): void {
    const stmt = this.db.prepare(this._sql.insertIdeEvent);
    const insert = this.db.transaction((evts: IdeEvent[]) => {
      for (const e of evts) stmt.run([e.ts, e.file, e.event_type]);
    });
    insert(events);
  }

  getSummary(fromMs: number, toMs: number): IdeSummaryRow[] {
    return this.db
      .prepare(this._sql.getSummary)
      .all([fromMs, toMs]) as IdeSummaryRow[];
  }

  getIdeDurationMs(fromMs: number, toMs: number): number {
    const row = this.db
      .prepare(this._sql.getIdeDurationTotal)
      .get([fromMs, toMs]) as { total: number } | undefined;
    return row?.total ?? 0;
  }

  getKeystrokeCount(fromMs: number, toMs: number): number {
    const row = this.db
      .prepare(this._sql.getKeystrokeCountBetween)
      .get([fromMs, toMs]) as { cnt: number } | undefined;
    return row?.cnt ?? 0;
  }

  getRecentEvents(limit: number): IdeEvent[] {
    return this.db
      .prepare(this._sql.getRecentEvents)
      .all([limit]) as IdeEvent[];
  }

  getLastCommitTs(): number | null {
    const row = this.db.prepare(this._sql.getLastCommitTs).get() as
      | { value: string }
      | undefined;
    return row ? parseInt(row.value) : null;
  }

  getKeystrokeCountSince(sinceMs: number): number {
    const row = this.db
      .prepare(this._sql.getKeystrokeCountSince)
      .get([sinceMs]) as { count: number } | undefined;
    return row?.count ?? 0;
  }

  upsertLastCommit(ts: number): void {
    this.db.prepare(this._sql.upsertLastCommitTs).run([ts.toString()]);
  }

  async getRecentlyTouchedFiles(limit: number): Promise<string[]> {
    const cutoff = Date.now() - 15 * 60 * 1000;

    const rows = this.db
      .prepare(this._sql.getRecentlyTouchedFiles)
      .all([cutoff, limit]) as { file: string }[];

    return rows.map((r) => r.file.split("/").pop() ?? r.file);
  }

  async getGitDiffSummary(): Promise<string> {
    return await getGitDiffSummary(process.cwd());
  }

  async getTodoComments(): Promise<string[]> {
    return await getTodoComments(process.cwd());
  }

  
  insertActiveSession(payload: ActiveSessionPayload): void {
    this.db
      .prepare(this._sql.insertActiveSession)
      .run([
        payload.timestamp,
        payload.appName,
        payload.filePath,
        payload.windowTitle,
        payload.isCoding,
        payload.durationMs,
      ]);
  }

  async getActiveFilesLast15Min(): Promise<string[]> {
    const fifteenMinAgo = Date.now() - 15 * 60 * 1000;
    const rows = this.db
      .prepare(
        `
    SELECT DISTINCT file_path 
    FROM active_work_sessions 
    WHERE timestamp >? AND is_coding = 1 AND file_path!= '__no_file__'
  `,
      )
      .all([fifteenMinAgo]);
    return rows.map((r: any) => r.file_path);
  }


  cleanupOldSessions(): number {
    const cutoff = Date.now() - 15 * 60 * 1000;
    const result = this.db
      .prepare(this._sql.cleanupActiveSessions)
      .run([cutoff]);
    return result.changes;
  }
}

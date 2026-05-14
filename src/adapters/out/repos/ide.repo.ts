/**
 * ideRepo - a snapshot: “what counts as an active work session right now?”
 * Every class should answer one question cleanly.
 * For IdeRepo, that question is: "how do I read and write app activity data to SQLite?"
 * The repo has one job: reads data, writes data, runs queries.
 */

import type { Database } from "better-sqlite3";
import { loadSql } from "../../../infrastructure/db/sql.js";
import {
  getGitDiffSummary,
  getTodoComments,
} from "../../../infrastructure/git-intel.js";
import { IIdeRepo } from "../../../domain/ports/out/IIdeRepo.js";
import {
  ActiveSessionPayload,
  AppBreakdown,
} from "../../../domain/models/activity.js";

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

export class IdeRepo implements IIdeRepo {
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

    insertActiveSession: loadSql("queries/ide/insert_active_session.sql"),
    cleanupActiveSessions: loadSql("queries/ide/cleanup_active_sessions.sql"),
    getFilesInWindow: loadSql("queries/ide/get_files_in_window.sql"),
    getAppBreakdownInWindow: loadSql(
      "queries/ide/get_app_breakdown_in_window.sql",
    ),
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

  getRecentlyTouchedFiles(limit: number): string[] {
    const cutoff = Date.now() - 15 * 60 * 1000;

    const rows = this.db
      .prepare(this._sql.getRecentlyTouchedFiles)
      .all([cutoff, limit]) as { file: string }[];

    return rows.map((r) => r.file);
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
      .run(
        payload.startMs,
        payload.appName,
        payload.filePath,
        payload.windowTitle,
        payload.isCoding ? 1 : 0,
        payload.durationMs,
      );
  }

  cleanupOldSessions(): number {
    const cutoff = Date.now() - 15 * 60 * 1000;
    const result = this.db
      .prepare(this._sql.cleanupActiveSessions)
      .run([cutoff]);
    return result.changes;
  }

  getFilesInWindow(fromMs: number, toMs: number, limit = 20): string[] {
    const rows = this.db
      .prepare(this._sql.getFilesInWindow)
      .all([fromMs, toMs, limit]) as { file: string }[];
    return rows.map((r) => r.file);
  }

  getAppBreakdownInWindow(fromMs: number, toMs: number): AppBreakdown[] {
    const rows = this.db
      .prepare(this._sql.getAppBreakdownInWindow)
      .all([fromMs, toMs]) as { app_name: string; total_ms: number }[];

    const total = rows.reduce((s, r) => s + r.total_ms, 0) || 1;

    return rows
      .filter((r) => r.app_name !== "unknown")
      .map((r) => ({
        appName: r.app_name,
        totalMs: r.total_ms,
        pct: Math.round((r.total_ms / total) * 100),
      }));
  }
}

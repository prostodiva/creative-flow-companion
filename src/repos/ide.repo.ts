import type { Database } from 'better-sqlite3'

export interface IdeEvent {
  ts: number
  file: string
  event_type: string
  project?: string // Add this - derived from file path
}

export interface IdeSummaryRow {
  file: string // Not 'ide' 
  project: string // Add this
  total_ms: number
}

export class IdeRepo {
  constructor(private db: Database) {}

  insertKeystroke(evt: IdeEvent): void {
    this.db.prepare(
      `INSERT INTO ide_events (ts, file, event_type) VALUES (?,?,?)`
    ).run([evt.ts, evt.file, evt.event_type])
  }

  insertMany(events: IdeEvent[]): void {
    const stmt = this.db.prepare(`INSERT INTO ide_events (ts, file, event_type) VALUES (?,?,?)`)
    const insert = this.db.transaction((evts: IdeEvent[]) => {
      for (const e of evts) stmt.run([e.ts, e.file, e.event_type])
    })
    insert(events)
  }

  getSummary(fromMs: number, toMs: number): IdeSummaryRow[] {
    return this.db.prepare(
      `SELECT project, file, SUM(duration_ms) as total_ms 
       FROM ide_activity WHERE ts BETWEEN? AND? GROUP BY project, file`
    ).all([fromMs, toMs]) as IdeSummaryRow[]
  }

  getIdeDurationMs(fromMs: number, toMs: number): number {
    const row = this.db.prepare(
      `SELECT COALESCE(SUM(duration_ms), 0) as total 
       FROM ide_activity WHERE ts BETWEEN? AND?`
    ).get([fromMs, toMs]) as { total: number }
    return row?.total?? 0
  }

  getKeystrokeCount(fromMs: number, toMs: number): number {
    const row = this.db.prepare(
      `SELECT COUNT(*) as cnt FROM ide_events 
       WHERE ts BETWEEN? AND? AND event_type = 'keystroke'`
    ).get([fromMs, toMs]) as { cnt: number }
    return row?.cnt?? 0
  }

  getRecentEvents(limit: number): IdeEvent[] {
    return this.db.prepare(
      `SELECT * FROM ide_events ORDER BY ts DESC LIMIT?`
    ).all([limit]) as IdeEvent[]
  }

  getLastCommitTs(): number | null {
    const row = this.db.prepare(
      `SELECT value FROM meta WHERE key = 'last_commit_ts'`
    ).get() as { value: string } | undefined
    return row? parseInt(row.value) : null
  }

  getKeystrokeCountSince(sinceMs: number): number {
    const row = this.db.prepare(
      `SELECT COUNT(*) as count FROM ide_events 
       WHERE ts >? AND event_type = 'keystroke'`
    ).get([sinceMs]) as { count: number }
    return row?.count?? 0
  }

  upsertLastCommit(ts: number): void {
    this.db.prepare(
      `INSERT OR REPLACE INTO meta (key, value) VALUES ('last_commit_ts',?)`
    ).run([ts.toString()])
  }
}
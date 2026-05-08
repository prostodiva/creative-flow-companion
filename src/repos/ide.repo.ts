import type { Database } from 'better-sqlite3'
import { loadSql } from '../db/sql.js'

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
  private readonly _sql = {
    insertIdeEvent: loadSql('queries/ide/insert_ide_event.sql'),
    getSummary: loadSql('queries/ide/get_summary.sql'),
    getIdeDurationTotal: loadSql('queries/ide/get_ide_duration_total.sql'),
    getKeystrokeCountBetween: loadSql('queries/ide/get_keystroke_count_between.sql'),
    getRecentEvents: loadSql('queries/ide/get_recent_events.sql'),
    getLastCommitTs: loadSql('queries/ide/get_last_commit_ts.sql'),
    getKeystrokeCountSince: loadSql('queries/ide/get_keystroke_count_since.sql'),
    upsertLastCommitTs: loadSql('queries/ide/upsert_last_commit_ts.sql'),
  }

  constructor(private db: Database) {}

  insertKeystroke(evt: IdeEvent): void {
    this.db.prepare(this._sql.insertIdeEvent).run([evt.ts, evt.file, evt.event_type])
  }

  insertMany(events: IdeEvent[]): void {
    const stmt = this.db.prepare(this._sql.insertIdeEvent)
    const insert = this.db.transaction((evts: IdeEvent[]) => {
      for (const e of evts) stmt.run([e.ts, e.file, e.event_type])
    })
    insert(events)
  }

  getSummary(fromMs: number, toMs: number): IdeSummaryRow[] {
    return this.db.prepare(this._sql.getSummary).all([fromMs, toMs]) as IdeSummaryRow[]
  }

  getIdeDurationMs(fromMs: number, toMs: number): number {
    const row = this.db.prepare(this._sql.getIdeDurationTotal).get([fromMs, toMs]) as
      | { total: number }
      | undefined
    return row?.total?? 0
  }

  getKeystrokeCount(fromMs: number, toMs: number): number {
    const row = this.db.prepare(this._sql.getKeystrokeCountBetween).get([fromMs, toMs]) as
      | { cnt: number }
      | undefined
    return row?.cnt?? 0
  }

  getRecentEvents(limit: number): IdeEvent[] {
    return this.db.prepare(this._sql.getRecentEvents).all([limit]) as IdeEvent[]
  }

  getLastCommitTs(): number | null {
    const row = this.db.prepare(this._sql.getLastCommitTs).get() as { value: string } | undefined
    return row? parseInt(row.value) : null
  }

  getKeystrokeCountSince(sinceMs: number): number {
    const row = this.db.prepare(this._sql.getKeystrokeCountSince).get([sinceMs]) as
      | { count: number }
      | undefined
    return row?.count?? 0
  }

  upsertLastCommit(ts: number): void {
    this.db.prepare(this._sql.upsertLastCommitTs).run([ts.toString()])
  }
}
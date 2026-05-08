import type { Database } from 'better-sqlite3'
import { createHash } from 'crypto'

export interface AppActivity {
  id?: number
  ts: number
  app: string
  title: string
  domain?: string | null  // Add | null
  is_fullscreen?: boolean
  has_audio?: boolean
  category?: string | null  // Add | null
  duration_ms: number
}

export interface AppSummaryRow {
  app: string
  total_ms: number
  tab_count: number
}

export class AppRepo {
  constructor(private db: Database) {}

  classifyTitle(title: string, domain: string | null): string {
  const t = title.toLowerCase()
  const d = (domain || '').toLowerCase()

  // YouTube = entertainment even if not audible
  if (d.includes('youtube.com') || d.includes('youtu.be')) return 'entertainment'
  if (d.includes('netflix.com') || d.includes('twitch.tv')) return 'entertainment'

  // Meta AI = work
  if (d.includes('meta.ai') || d.includes('claude.ai') || d.includes('chat.openai.com')) return 'work'

  if (d.includes('github.com') || d.includes('localhost')) return 'work'
  if (t.match(/github|vscode|cursor|stack overflow/)) return 'work'

  return 'unknown'
}

  async insertMany(activities: AppActivity[]): Promise<void> {
    const stmt = this.db.prepare(
      `INSERT INTO app_activity (ts, app, title, domain, is_fullscreen, has_audio, category, duration_ms)
       VALUES (?,?,?,?,?,?,?,?)`
    )
    const insert = this.db.transaction((acts: AppActivity[]) => {
      for (const a of acts) {
        stmt.run([
          a.ts, a.app, a.title, a.domain?? null,
          a.is_fullscreen? 1 : 0, a.has_audio? 1 : 0,
          a.category?? null, a.duration_ms
        ])
      }
    })
    insert(activities)
  }

 async getVideoConsumptionMs(fromMs: number, toMs: number, category?: string): Promise<number> {
  // Remove fullscreen + audio requirement for entertainment
  let query = `SELECT COALESCE(SUM(duration_ms), 0) AS total
     FROM app_activity
     WHERE ts BETWEEN ? AND ?`
  
  const params: any[] = [fromMs, toMs]
  
  if (category) {
    // Match both 'entertainment' and 'entertainment_video'
    query += ` AND category IN (?, ?)`
    params.push(category, category.replace('_video', ''))
  }
  
  const row = this.db.prepare(query).get(params) as { total: number }
  return row?.total ?? 0
}

  async getChromeTabCount(fromMs: number): Promise<number> {
    const row = this.db.prepare(
      `SELECT COUNT(*) as count FROM app_activity 
       WHERE app = 'Google Chrome' AND ts >?`
    ).get([fromMs]) as { count: number }
    return row?.count?? 0
  }

  async getCurrentApp(): Promise<string | null> {
    const row = this.db.prepare(
      `SELECT app FROM app_activity ORDER BY ts DESC LIMIT 1`
    ).get() as { app: string } | undefined
    return row?.app?? null
  }

  async getSummary(fromMs: number, toMs: number): Promise<AppSummaryRow[]> {
    return this.db.prepare(
      `SELECT app, SUM(duration_ms) as total_ms, COUNT(*) as tab_count
       FROM app_activity WHERE ts BETWEEN? AND? GROUP BY app`
    ).all([fromMs, toMs]) as AppSummaryRow[]
  }

  async getRecentActivity(limit: number): Promise<AppActivity[]> {
    return this.db.prepare(
      `SELECT * FROM app_activity ORDER BY ts DESC LIMIT?`
    ).all([limit]) as AppActivity[]
  }

  async getCachedCategory(title: string, domain?: string): Promise<string | null> {
    const hash = createHash('sha256').update(`${title}|${domain?? ''}`).digest('hex')
    const row = this.db.prepare(
      `SELECT category FROM title_classifications WHERE title_hash =?`
    ).get([hash]) as { category: string } | undefined
    return row?.category?? null
  }

  async cacheCategory(title: string, domain: string | undefined, category: string): Promise<void> {
    const hash = createHash('sha256').update(`${title}|${domain?? ''}`).digest('hex')
    this.db.prepare(
      `INSERT OR REPLACE INTO title_classifications (title_hash, title, domain, category, classified_at)
       VALUES (?,?,?,?,?)`
    ).run([hash, title, domain?? null, category, Date.now()])
  }
}
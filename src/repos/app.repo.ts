import type { Database } from "better-sqlite3";
import { createHash } from "crypto";
import { loadSql } from "../db/sql.js";

export interface AppActivity {
  id?: number;
  ts: number;
  app: string;
  title: string;
  domain?: string | null; 
  is_fullscreen?: boolean;
  has_audio?: boolean;
  category?: string | null; 
  duration_ms: number;
  chrome_tab_count?: number | null;
}

export interface AppSummaryRow {
  app: string;
  total_ms: number;
  tab_count: number;
}

export class AppRepo {
  private readonly _sql = {
    insertAppActivity: loadSql("queries/app/insert_app_activity.sql"),
    getVideoConsumptionTotal: loadSql(
      "queries/app/get_video_consumption_total.sql",
    ),
    getVideoConsumptionTotalByCategory: loadSql(
      "queries/app/get_video_consumption_total_by_category.sql",
    ),
    getChromeTabCount: loadSql("queries/app/get_chrome_tab_count.sql"),
    getCurrentApp: loadSql("queries/app/get_current_app.sql"),
    getSummary: loadSql("queries/app/get_summary.sql"),
    getRecentActivity: loadSql("queries/app/get_recent_activity.sql"),
    getCachedCategory: loadSql("queries/app/get_cached_category.sql"),
    upsertTitleClassification: loadSql(
      "queries/app/upsert_title_classification.sql",
    ),
  };

  constructor(private db: Database) {}

  classifyTitle(title: string, domain: string | null): string {
    const t = title.toLowerCase();
    const d = (domain || "").toLowerCase();

    if (d.includes("youtube.com") || d.includes("youtu.be"))
      return "entertainment";
    if (d.includes("netflix.com") || d.includes("twitch.tv"))
      return "entertainment";

    if (
      d.includes("meta.ai") ||
      d.includes("claude.ai") ||
      d.includes("chat.openai.com")
    )
      return "work";

    if (d.includes("github.com") || d.includes("localhost")) return "work";
    if (t.match(/github|vscode|cursor|stack overflow/)) return "work";

    return "unknown";
  }

  async insertMany(activities: AppActivity[]): Promise<void> {
    const stmt = this.db.prepare(this._sql.insertAppActivity);
    const insert = this.db.transaction((acts: AppActivity[]) => {
      for (const a of acts) {
        stmt.run([
          a.ts,
          a.app,
          a.title,
          a.domain ?? null,
          a.is_fullscreen ? 1 : 0,
          a.has_audio ? 1 : 0,
          a.category ?? null,
          a.duration_ms,
          a.chrome_tab_count ?? null,
        ]);
      }
    });
    insert(activities);
  }

  async getVideoConsumptionMs(
    fromMs: number,
    toMs: number,
    category?: string,
  ): Promise<number> {
    if (category) {
      const stmt = this.db.prepare(`
      SELECT COALESCE(SUM(duration_ms), 0) as total
      FROM app_activity 
      WHERE ts > ? 
        AND ts <= ? 
        AND has_audio = 1 
        AND category = ?
    `);
      const row = stmt.get(fromMs, toMs, category) as
        | { total: number }
        | undefined;
      return row?.total ?? 0;
    }

    const stmt = this.db.prepare(`
    SELECT COALESCE(SUM(duration_ms), 0) as total
    FROM app_activity 
    WHERE ts > ? 
      AND ts <= ? 
      AND has_audio = 1
  `);
    const row = stmt.get(fromMs, toMs) as { total: number } | undefined;
    return row?.total ?? 0;
  }

  async getChromeTabCount(fromMs: number): Promise<number> {
    const row = this.db.prepare(this._sql.getChromeTabCount).get([fromMs]) as
      | { count: number }
      | undefined;
    return row?.count ?? 0;
  }

  async getCurrentApp(): Promise<string | null> {
    const row = this.db.prepare(this._sql.getCurrentApp).get() as
      | { app: string }
      | undefined;
    return row?.app ?? null;
  }

  async getSummary(fromMs: number, toMs: number): Promise<AppSummaryRow[]> {
    return this.db
      .prepare(this._sql.getSummary)
      .all([fromMs, toMs]) as AppSummaryRow[];
  }

  async getRecentActivity(limit: number): Promise<AppActivity[]> {
    return this.db
      .prepare(this._sql.getRecentActivity)
      .all([limit]) as AppActivity[];
  }

  async getCachedCategory(
    title: string,
    domain?: string,
  ): Promise<string | null> {
    const hash = createHash("sha256")
      .update(`${title}|${domain ?? ""}`)
      .digest("hex");
    const row = this.db.prepare(this._sql.getCachedCategory).get([hash]) as
      | { category: string }
      | undefined;
    return row?.category ?? null;
  }

  async cacheCategory(
    title: string,
    domain: string | undefined,
    category: string,
  ): Promise<void> {
    const hash = createHash("sha256")
      .update(`${title}|${domain ?? ""}`)
      .digest("hex");
    this.db
      .prepare(this._sql.upsertTitleClassification)
      .run([hash, title, domain ?? null, category, Date.now()]);
  }
}

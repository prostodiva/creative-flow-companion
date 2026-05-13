/**
 * appRepo = “write a log line about what was on screen"
 * Every class should answer one question cleanly. 
 * For AppRepo, that question is: "how do I read and write app activity data to SQLite?"
 * The repo has one job: reads data, writes data, runs queries. 
 */


import type { Database } from "better-sqlite3";
import { createHash } from "crypto";
import { loadSql } from "../../../infrastructure/db/sql.js";
import { IAppRepo } from "../../../domain/ports/out/IAppRepo.js";
import { AppActivity } from '../../../domain/models/activity.js';

export interface AppSummaryRow {
  app: string;
  total_ms: number;
  tab_count: number;
}

export class AppRepo implements IAppRepo {
  private readonly _sql = {
    insertAppActivity: loadSql("queries/app/insert_app_activity.sql"),
    getVideoConsumptionTotal: loadSql("queries/app/get_video_consumption_total.sql"),
    getVideoConsumptionTotalByCategory: loadSql("queries/app/get_video_consumption_total_by_category.sql"),
    getChromeTabCount: loadSql("queries/app/get_chrome_tab_count.sql"),
    getCurrentApp: loadSql("queries/app/get_current_app.sql"),
    getSummary: loadSql("queries/app/get_summary.sql"),
    getRecentActivity: loadSql("queries/app/get_recent_activity.sql"),
    getCachedCategory: loadSql("queries/app/get_cached_category.sql"),
    upsertTitleClassification: loadSql("queries/app/upsert_title_classification.sql"),
  };

  constructor(private db: Database) {
    console.log("DB constructor:", this.db?.constructor?.name)
  }

  private titleHash(title: string, domain?: string): string {
    return createHash('sha256')
    .update(`${title}|${domain ?? ''}`)
    .digest('hex')
  }

  insertMany(activities: AppActivity[]): void {
  const stmt = this.db.prepare(this._sql.insertAppActivity);
  const insertMany = this.db.transaction((acts: AppActivity[]) => {
    for (const a of acts) {
      stmt.run([
        a.ts,                    // ts
        a.appName,               // app
        a.windowTitle,           // title
        a.domain ?? null,        // domain
        a.isFullscreen ?? 0,     // is_fullscreen - add to interface or default to 0
        a.hasAudio ?? 0,         // has_audio - add to interface or default to 0
        a.category,              // category
        a.durationMs,            // duration_ms
        a.chromeTabCount ?? 0    // chrome_tab_count - add to interface or default to 0
      ]);
    }
  });
  insertMany(activities);
}

    cacheCategory(title: string, domain: string | undefined, category: string): void {
    this.db.prepare(this._sql.upsertTitleClassification).run([
      this.titleHash(title, domain),
      title,
      domain ?? null,
      category,
      Date.now(),
    ])
  }

  getVideoConsumptionMs(fromMs: number, toMs: number): number {
    const row = this.db.prepare(this._sql.getVideoConsumptionTotal)
      .get([fromMs, toMs]) as {total: number } | undefined
    return row?.total ?? 0;
  }

  // getVideoConsumptionTotalByCategory(fromMs: number, toMs: number, category: string): number {
  //   const row = this.db.prepare(this._sql.getVideoConsumptionTotalByCategory)
  //   .get([fromMs, toMs, category]) as { total: number } | undefined
  //   return row?.total ?? 0;
  // }

    getVideoConsumptionTotalByCategory(
    fromMs: number,
    toMs: number,
    category: string
  ): number {
    const stmt = this.db.prepare(`
    SELECT COALESCE(SUM(duration_ms), 0) as total
    FROM app_activity
    WHERE ts > ?
      AND ts <= ?
      AND category = ?;
  `);

    const row = stmt.get(fromMs, toMs, category) as
      | { total: number }
      | undefined

    return row?.total ?? 0
  }


  getChromeTabCount(fromMs: number): number {
    const row = this.db.prepare(this._sql.getChromeTabCount).get([fromMs]) as
      | { count: number }
      | undefined;
    return row?.count ?? 0;
  }

   getCurrentApp(): string | null {
    const row = this.db.prepare(this._sql.getCurrentApp).get() as
      | { app: string }
      | undefined;
    return row?.app ?? null;
  }

  getSummary(fromMs: number, toMs: number): AppSummaryRow[] {
    return this.db
      .prepare(this._sql.getSummary)
      .all([fromMs, toMs]) as AppSummaryRow[];
  }

  getRecentActivity(limit: number): AppActivity[]{
    return this.db
      .prepare(this._sql.getRecentActivity)
      .all([limit]) as AppActivity[];
  }

  getCachedCategory(title: string, domain?: string): string | null {
    const row = this.db.prepare(this._sql.getCachedCategory)
      .get([this.titleHash(title, domain)]) as { category: string } | undefined
    return row?.category ?? null
  }
}

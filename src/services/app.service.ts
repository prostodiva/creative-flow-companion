import type { AppRepo, AppSummaryRow } from '../repos/app.repo.js';
import { sanitizeForLLM } from '../utils/redact.js';

export interface AppSummary {
  fromMs: number;
  toMs: number;
  apps: AppSummaryRow[];
}

export class AppService {
  constructor(private readonly repo: AppRepo) {}

  async getSummary(windowMs = 60 * 60 * 1000): Promise<AppSummary> {
    const toMs = Date.now();
    const fromMs = toMs - windowMs;
    const apps = await this.repo.getSummary(fromMs, toMs);

    // Sanitize for LLM consumption
    const sanitised = apps.map((row) => ({
      ...row,
      app: sanitizeForLLM(row.app),
    }));

    return { fromMs, toMs, apps: sanitised };
  }

  async getRecentActivity(limit = 50) {
    const rows = await this.repo.getRecentActivity(limit);
    return rows.map((r) => ({
      ...r,
      app: sanitizeForLLM(r.app),
      title: sanitizeForLLM(r.title),
    }));
  }
}
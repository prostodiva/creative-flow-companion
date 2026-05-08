import type { IdeRepo, IdeSummaryRow, IdeEvent } from '../repos/ide.repo.js';
import { redact } from '../utils/redact.js';

export class IdeService {
  constructor(private repo: IdeRepo) {}

  async getSummary(fromMs: number, toMs: number) {
    const rows = await this.repo.getSummary(fromMs, toMs);
    return rows.map((s: IdeSummaryRow) => ({
      
      total_ms: s.total_ms
    }));
  }

  async getRecentEvents(limit: number) {
    const events = await this.repo.getRecentEvents(limit);
    return events.map((r: IdeEvent) => ({
      ts: r.ts,
     
      event_type: r.event_type,
     
    }));
  }
}
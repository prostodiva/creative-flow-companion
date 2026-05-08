import type { IdeRepo, IdeSummaryRow } from '../repos/ide.repo.js';
import { sanitizeForLLM } from '../utils/redact.js';

export interface IdeSummary {
  fromMs: number;
  toMs: number;
  sessions: IdeSummaryRow[];
  keystrokeCount: number;
}

export class IdeService {
  constructor(private readonly repo: IdeRepo) {}

  async getSummary(windowMs = 60 * 60 * 1000): Promise<IdeSummary> {
    const toMs = Date.now();
    const fromMs = toMs - windowMs;

    const [sessions, keystrokeCount] = await Promise.all([
      this.repo.getSummary(fromMs, toMs),
      this.repo.getKeystrokeCount(fromMs, toMs),
    ]);

    const sanitised: IdeSummaryRow[] = sessions.map((s) => ({
      ...s,
      project: sanitizeForLLM(s.project),
      ide: sanitizeForLLM(s.ide),
    }));

    return { fromMs, toMs, sessions: sanitised, keystrokeCount };
  }

  async getRecentEvents(limit = 50) {
    const rows = await this.repo.getRecentEvents(limit);
    return rows.map((r) => ({
      ...r,
      project: sanitizeForLLM(r.project),
      file: sanitizeForLLM(r.file),
    }));
  }
}
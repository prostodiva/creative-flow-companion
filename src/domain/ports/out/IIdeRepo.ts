import {
  ActiveSessionPayload,
  AppBreakdown,
} from "../../../domain/models/activity.js";

export interface IIdeRepo {
  getRecentlyTouchedFiles(limit: number): string[];
  getLastCommitTs(): number | null;
  getKeystrokeCountSince(sinceMs: number): number;
  insertActiveSession(payload: ActiveSessionPayload): void;
  cleanupOldSessions(): number;
  getFilesInWindow(fromMs: number, toMs: number, limit?: number): string[];
  getAppBreakdownInWindow(fromMs: number, toMs: number): AppBreakdown[];
  getGitDiffSummary(): Promise<string>;
  getTodoComments(): Promise<string[]>;
}

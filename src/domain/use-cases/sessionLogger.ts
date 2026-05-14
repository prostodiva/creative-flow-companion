/**
 * Session summarization use-case
 *
 * SessionLogger:
 *  - aggregates telemetry over a time window
 *  - derives behavioral patterns
 *  - builds a semantic session document
 *  - persists it to ChromaDB
 *
 * Does NOT handle scheduling (see SessionScheduler in infrastructure)
 */

import { IAppRepo } from "../ports/out/IAppRepo.js";
import { IIdeRepo } from "../ports/out/IIdeRepo.js";
import { writeSession, type SessionDocument } from "./memoryWriter.js";

export class SessionLogger {
  constructor(
    private readonly ideRepo: IIdeRepo,
    private readonly appRepo: IAppRepo,
    private readonly windowMs: number,
  ) {}

  async execute(): Promise<void> {
    const end = new Date();
    const start = new Date(end.getTime() - this.windowMs);

    const fromMs = start.getTime();
    const toMs = end.getTime();

    const filesTouched = this.ideRepo.getFilesInWindow(fromMs, toMs);
    const breakdown = this.ideRepo.getAppBreakdownInWindow(fromMs, toMs);

    const appBreakdown =
      breakdown.length > 0
        ? breakdown.map((b) => `${b.appName} ${b.pct}%`).join(", ")
        : "Unknown";

    const lastCommitTs = await this.ideRepo.getLastCommitTs();

    const entMs = this.appRepo.getVideoConsumptionTotalByCategory(
      fromMs,
      toMs,
      "entertainment",
    );

    const entertainmentMin = Math.floor(entMs / 60_000);

    const commitCount = lastCommitTs && lastCommitTs > fromMs ? 1 : 0;

    const text = formatDocument({
      start,
      end,
      appBreakdown,
      filesTouched,
      entertainmentMin,
      commitCount,
    });

    const doc: SessionDocument = {
      id: makeSessionId(end),
      text,
      metadata: {
        date: end.toISOString().slice(0, 10),
        ts: end.getTime(),
        appPrimary: appBreakdown,
        hadCommits: commitCount > 0,
        commitCount,
        entertainmentMin,
        filesTouched: filesTouched.join("|"),
      },
    };

    await writeSession(doc);
  }
}

/* =========================
   Pure formatting logic
   ========================= */

function formatDocument(opts: {
  start: Date;
  end: Date;
  appBreakdown: string;
  filesTouched: string[];
  entertainmentMin: number;
  commitCount: number;
}): string {
  const start = opts.start.toISOString().slice(0, 16).replace("T", " ");
  const end = opts.end.toISOString().slice(11, 16);

  const files =
    opts.filesTouched.length > 0 ? opts.filesTouched.join(", ") : "none";

  const codingLine =
    opts.filesTouched.length > 0
      ? `VSCode files: ${files}.`
      : "VSCode: no files opened.";

  const commitLine =
    opts.commitCount === 0
      ? "0 commits made."
      : `${opts.commitCount} commit(s) made.`;

  const entLine =
    opts.entertainmentMin > 0
      ? `Entertainment/video: ${opts.entertainmentMin} minutes.`
      : "";

  const pattern = derivePattern(opts);

  return [
    `Session ${start}-${end}:`,
    `Primarily ${opts.appBreakdown || "unknown"}.`,
    codingLine,
    commitLine,
    entLine,
    pattern,
  ]
    .filter(Boolean)
    .join(" ");
}

function derivePattern(opts: {
  filesTouched: string[];
  entertainmentMin: number;
  commitCount: number;
}): string {
  if (opts.entertainmentMin > 20 && opts.commitCount === 0) {
    return "Pattern: watching/consuming, not implementing.";
  }

  if (opts.filesTouched.length > 0 && opts.commitCount === 0) {
    return "Pattern: files opened but no output committed.";
  }

  if (opts.commitCount > 0) {
    return `Pattern: productive — ${opts.commitCount} commit(s).`;
  }

  return "Pattern: idle.";
}

function makeSessionId(date: Date): string {
  const d = date.toISOString().slice(0, 16).replace("T", "_").replace(":", "");

  return `session_${d}`;
}

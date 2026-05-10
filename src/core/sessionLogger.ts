
import cron from "node-cron";
import { logger } from "./logger.js";
import { writeSession, type SessionDocument } from "../core/memoryWriter.js";
import type { IdeRepo } from "../repos/ide.repo.js";
import type { AppRepo } from "../repos/app.repo.js";

const WINDOW_MS = 30 * 60 * 1_000; // 30 minutes
const CRON_EXPR = "0 */30 * * * *"; // every 30 min on the hour/half-hour

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
  if (opts.entertainmentMin > 20 && opts.commitCount === 0)
    return "Pattern: watching/consuming, not implementing.";
  if (opts.filesTouched.length > 0 && opts.commitCount === 0)
    return "Pattern: files opened but no output committed.";
  if (opts.commitCount > 0)
    return `Pattern: productive — ${opts.commitCount} commit(s).`;
  return "Pattern: idle.";
}


function makeSessionId(date: Date): string {
  // "session_2026-01-26_1430"
  const d = date.toISOString().slice(0, 16).replace("T", "_").replace(":", "");
  return `session_${d}`;
}


export async function collectAndWriteSession(
  ideRepo: IdeRepo,
  appRepo: AppRepo,
): Promise<void> {
  const end = new Date();
  const start = new Date(end.getTime() - WINDOW_MS);
  const fromMs = start.getTime();
  const toMs = end.getTime();

  const filesTouched = ideRepo.getFilesInWindow(fromMs, toMs);        // ← fixed
  const appBreakdown = ideRepo.getAppBreakdownInWindow(fromMs, toMs); // ← fixed
 
  // Video consumption from app_activity table (unchanged)
  const [entMs, lastCommitTs] = await Promise.all([
    appRepo.getVideoConsumptionMs(fromMs, toMs, "entertainment"),
    ideRepo.getLastCommitTs(),
  ]);
 
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
 
  // ① Console FIRST — readable even if ChromaDB is down
  console.log("\n╔══ SESSION LOG ══════════════════════════════════════════════");
  console.log(`║ Period  : ${start.toISOString().slice(0, 16)} → ${end.toISOString().slice(11, 16)}`);
  console.log(`║ Apps    : ${appBreakdown}`);
  console.log(`║ Files   : ${filesTouched.join(", ") || "none"}`);
  console.log(`║ Commits : ${commitCount}`);
  console.log(`║ Video   : ${entertainmentMin}min entertainment`);
  console.log(`║ Doc     : ${text}`);
  console.log("╚════════════════════════════════════════════════════════════\n");
 
  // ② Write to ChromaDB
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
  logger.info({ sessionId: doc.id }, "[SessionLogger] Session written to ChromaDB");
}
 

let _task: ReturnType<typeof cron.schedule> | null = null;

export function startSessionLogger(ideRepo: IdeRepo, appRepo: AppRepo): void {
  logger.info("[SessionLogger] Started — logging every 30 minutes");

  _task = cron.schedule(CRON_EXPR, async () => {
    try {
      await collectAndWriteSession(ideRepo, appRepo);
    } catch (err) {
      logger.error({ err }, "[SessionLogger] Failed to write session");
    }
  });
}

export function stopSessionLogger(): void {
  _task?.stop();
  logger.info("[SessionLogger] Stopped");
}

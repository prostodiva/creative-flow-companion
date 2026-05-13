
import cron from "node-cron";
import { logger } from "../../infrastructure/logger.js"
import { IAppRepo } from "../ports/out/IAppRepo.js";
import { IIdeRepo } from "../ports/out/IIdeRepo.js";
import { writeSession, type SessionDocument } from "./memoryWriter.js";

const WINDOW_MS = 30 * 60 * 1_000; 
const CRON_EXPR = "0 */30 * * * *"; 

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
  ideRepo: IIdeRepo,
  appRepo: IAppRepo,
): Promise<void> {
  const end = new Date();
  const start = new Date(end.getTime() - WINDOW_MS);
  const fromMs = start.getTime();
  const toMs = end.getTime();

  const filesTouched = ideRepo.getFilesInWindow(fromMs, toMs)
  const breakdown    = ideRepo.getAppBreakdownInWindow(fromMs, toMs)

  const appBreakdown = breakdown.length > 0
    ? breakdown.map((b) => `${b.appName} ${b.pct}%`).join(', ')
    : 'Unknown'

 
  const [lastCommitTs] = await Promise.all([
    ideRepo.getLastCommitTs(),
  ])
  const entMs = appRepo.getVideoConsumptionTotalByCategory(fromMs, toMs, 'entertainment')
 
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

export function startSessionLogger(ideRepo: IIdeRepo, appRepo: IAppRepo): void {
  logger.info("[SessionLogger] Started — logging every 30 minutes");

  let running = false;

  _task = cron.schedule(CRON_EXPR, async () => {
    if (running) return;

    running = true;

    try {
      await collectAndWriteSession(ideRepo, appRepo);
    } catch (err) {
      logger.error({ err }, "[SessionLogger] Failed to write session");
    } finally {
      running = false;
    }
  });
}

export function stopSessionLogger(): void {
  _task?.stop();
  logger.info("[SessionLogger] Stopped");
}

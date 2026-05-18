import Database from "better-sqlite3";
import "dotenv/config";
import { existsSync, unlinkSync } from "fs";
import os from "node:os";
import path from "node:path";
import { AppActivitySensor } from "./adapters/in/sensors/app-activity.sensor.js";
import { OllamaClient } from "./adapters/out/OllamaClient.js";
import { AppRepo } from "./adapters/out/repos/app.repo.js";
import { IdeRepo } from "./adapters/out/repos/ide.repo.js";
import { InterventionPolicy } from "./domain/models/InterventionPolicy.js";
import { InterventionState } from "./domain/models/InterventionState.js";
import { ActivityEnricher } from "./domain/use-cases/activityEnricher.js";
import { InterventionService } from "./domain/use-cases/intervention.service.js";
import { startOrchestrationLoop } from "./domain/use-cases/orchestrator.js";
import { config } from "./infrastructure/config.js";
import { runMigrations } from "./infrastructure/db/migrate.js";
import { logger } from "./infrastructure/logger.js";
import { SessionScheduler } from "./infrastructure/SessionSchedular.js";
import { SessionLogger } from "./domain/use-cases/sessionLogger.js";

const DB_PATH = path.join(os.homedir(), ".flow-agent", "context.db");

if (existsSync(DB_PATH)) {
  try {
    const testDb = new Database(DB_PATH, { readonly: true });
    testDb.close();
  } catch (err) {
    logger.warn("DB corrupt, deleting and recreating");
    unlinkSync(DB_PATH);
  }
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");

runMigrations(db);

const appRepo = new AppRepo(db);
const ideRepo = new IdeRepo(db);
const interventionService = new InterventionService();
const llm = new OllamaClient();
const appSensor = new AppActivitySensor(appRepo);
const enricher = new ActivityEnricher(appRepo, llm);
const interventionState = new InterventionState(
  config.INTERVENTION_COOLDOWN_MS,
);
const interventionPolicy = new InterventionPolicy(interventionState);
const summarizer = new SessionLogger(
  ideRepo,
  appRepo,
  config.SESSION_WINDOW_MS,
);

const scheduler = new SessionScheduler(summarizer);

interventionService.start();

appSensor.start();
enricher.start();
scheduler.start();

startOrchestrationLoop({
  ideRepo,
  appRepo,
  interventionService,
  llm,
  interventionState,
  interventionPolicy,
});


logger.info("Flow Agent Telemetry v2 ready");

process.on("SIGINT", () => {
  logger.info("Shutting down...");
  appSensor.stop();
  interventionService.stop()
  db.close();
  process.exit(0);
});

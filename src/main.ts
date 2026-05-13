import Database from "better-sqlite3";
import "dotenv/config";
import { existsSync, unlinkSync } from "fs";
import os from "node:os";
import path from "node:path";
import { AppActivitySensor } from './adapters/in/sensors/app-activity.sensor.js';
import { AppRepo } from './adapters/out/repos/app.repo.js';
import { IdeRepo } from './adapters/out/repos/ide.repo.js';
import { InterventionService } from './domain/use-cases/intervention.service.js';
import { startSessionLogger } from "./domain/use-cases/sessionLogger.js";
import { runMigrations } from "./infrastructure/db/migrate.js";
import { logger } from "./infrastructure/logger.js";
import { startOrchestrationLoop } from "./domain/use-cases/orchestrator.js";

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

runMigrations(db);

const appRepo = new AppRepo(db);
const ideRepo = new IdeRepo(db);
const interventionService = new InterventionService();

const appSensor = new AppActivitySensor(appRepo, ideRepo);

appSensor.start();

startOrchestrationLoop({ ideRepo, appRepo, interventionService });
startSessionLogger(ideRepo, appRepo);

logger.info("Flow Agent Telemetry v2 ready");

process.on("SIGINT", () => {
  logger.info("Shutting down...");
  appSensor.stop();
  db.close();
  process.exit(0);
});

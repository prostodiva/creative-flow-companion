import "dotenv/config";
import Database from "better-sqlite3";
import { existsSync, unlinkSync } from "fs";
import { AppRepo } from "./repos/app.repo.js";
import { IdeRepo } from "./repos/ide.repo.js";
import { InterventionService } from "./core/intervention.service.js";
import { startSessionLogger } from "./core/sessionLogger.js";
import { AppActivitySensor } from "./sensors/app-activity.sensor.js";
import { startOrchestrationLoop } from "./core/orchestrator.js";
import { logger } from "./core/logger.js";
import { runMigrations } from "./db/migrate.js";
import os from "node:os";
import path from "node:path";

//uncomment for testing db - data saving
// import { collectAndWriteSession } from './core/sessionLogger.js'
// setTimeout(() => collectAndWriteSession(ideRepo, appRepo), 3000)

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

startOrchestrationLoop({ appRepo, ideRepo, interventionService });
startSessionLogger(ideRepo, appRepo);

logger.info("Flow Agent Telemetry v2 ready");

process.on("SIGINT", () => {
  logger.info("Shutting down...");
  appSensor.stop();
  db.close();
  process.exit(0);
});

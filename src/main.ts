import Database from "better-sqlite3";
import "dotenv/config";
import { existsSync, unlinkSync } from "fs";
import os from "node:os";
import path from "node:path";
import { Ollama } from "@langchain/ollama"; 
import { AppActivitySensor } from './adapters/in/sensors/app-activity.sensor.js';
import { AppRepo } from './adapters/out/repos/app.repo.js';
import { IdeRepo } from './adapters/out/repos/ide.repo.js';
import { InterventionService } from './domain/use-cases/intervention.service.js';
import { startSessionLogger } from "./domain/use-cases/sessionLogger.js";
import { runMigrations } from "./infrastructure/db/migrate.js";
import { logger } from "./infrastructure/logger.js";
import { startOrchestrationLoop } from "./domain/use-cases/orchestrator.js";
import { ActivityEnricher } from "./domain/use-cases/activityEnricher.js";

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
db.pragma('synchronous = NORMAL');

runMigrations(db);

const appRepo = new AppRepo(db);
const ideRepo = new IdeRepo(db);
const interventionService = new InterventionService();

const ollama = new Ollama({
  model: process.env.OLLAMA_MODEL ?? "llama3.1",
  baseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
});

const appSensor = new AppActivitySensor(appRepo);
const enricher = new ActivityEnricher(appRepo, ollama);

appSensor.start();
enricher.start();

startOrchestrationLoop({ ideRepo, appRepo, interventionService });
startSessionLogger(ideRepo, appRepo);

logger.info("Flow Agent Telemetry v2 ready");

process.on("SIGINT", () => {
  logger.info("Shutting down...");
  appSensor.stop();
  db.close();
  process.exit(0);
});

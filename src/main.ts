/**
 * Flow Agent Telemetry v2 — entry point.
 *
 * Wires: DB → Repos → Services/Sensors → RuleEngine → InterventionService → MCP.
 * No SQL, no business logic here — only dependency injection.
 */

import 'dotenv/config';
import { getDB } from './core/db.js';
import { logger } from './core/logger.js';
import { AppRepo } from './repos/app.repo.js';
import { IdeRepo } from './repos/ide.repo.js';
import { AppService } from './services/app.service.js';
import { IdeService } from './services/ide.service.js';
import { AppActivitySensor } from './sensors/app-activity.sensor.js';
import { IdeSensor } from './sensors/ide/ide.sensor.js';
import { InterventionService } from './core/intervention.service.js';
import { RuleEngine } from './core/rule-engine.js';
import { createMcpServer, startMcpServer } from './core/mcp.js';
import type { Sensor } from './sensors/base/sensor.js';

// ---- Bootstrap -------------------------------------------------------------

async function main(): Promise<void> {
  const startedAt = Date.now();
  logger.info('Flow Agent Telemetry v2 starting…');

  // 1. Database (singleton, encrypted)
  const db = await getDB();

  // 2. Repositories — all SQL lives here
  const appRepo = new AppRepo(db);
  const ideRepo = new IdeRepo(db);

  // 3. Services — business logic, consumed by MCP tools
  const appService = new AppService(appRepo);
  const ideService = new IdeService(ideRepo);

  // 4. Sensors — receive repos, never import getDB
  const appSensor = new AppActivitySensor(appRepo);
  const ideSensor = new IdeSensor(ideRepo);

  const sensors: Sensor[] = [appSensor, ideSensor];

  // 5. Intervention channel (WebSocket + OS toast)
  const interventionService = new InterventionService();
  interventionService.start();

  // 6. Rule engine
  const ruleEngine = new RuleEngine(
    appRepo,
    ideRepo,
    interventionService,
    ideSensor,
    appSensor,
  );
  ruleEngine.start();

  // 7. Start sensors
  for (const sensor of sensors) {
    sensor.start();
  }

  // 8. MCP server
  const mcpServer = createMcpServer({
    sensors,
    appService,
    ideService,
    interventionService,
    startedAt,
  });
  await startMcpServer(mcpServer);

  logger.info(
    { startupMs: Date.now() - startedAt },
    'Flow Agent Telemetry v2 ready'
  );

  // ---- Graceful shutdown ---------------------------------------------------

  async function shutdown(signal: string): Promise<void> {
    logger.info({ signal }, 'Shutting down…');

    ruleEngine.stop();
    for (const sensor of sensors) {
      sensor.stop();
    }
    await interventionService.stop();
    await db.close();

    logger.info('Shutdown complete');
    process.exit(0);
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT',  () => void shutdown('SIGINT'));
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception — shutting down');
    void shutdown('uncaughtException');
  });
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'Unhandled rejection — shutting down');
    void shutdown('unhandledRejection');
  });
}

main().catch((err) => {
  // Use console here because logger may not be initialised
  console.error('Fatal startup error', err);
  process.exit(1);
});
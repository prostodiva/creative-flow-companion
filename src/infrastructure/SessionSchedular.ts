/**
 *
 * cron scheduling/runtime lifecycle
 */

import cron from "node-cron";

import { logger } from "../infrastructure/logger.js";
import { config } from "../infrastructure/config.js";

import { SessionLogger } from "../domain/use-cases/sessionLogger.js";

export class SessionScheduler {
  private task: ReturnType<typeof cron.schedule> | null = null;

  private running = false;

  constructor(private readonly summarizer: SessionLogger) {}

  start(): void {
    logger.info("[SessionScheduler] Started");

    this.task = cron.schedule(config.SESSION_CRON_EXPR, async () => {
      if (this.running) return;

      this.running = true;

      try {
        await this.summarizer.execute();
      } catch (err) {
        logger.error({ err }, "[SessionScheduler] Failed");
      } finally {
        this.running = false;
      }
    });
  }

  stop(): void {
    this.task?.stop();

    logger.info("[SessionScheduler] Stopped");
  }
}

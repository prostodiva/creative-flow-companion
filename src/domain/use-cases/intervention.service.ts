import notifier from "node-notifier";
import { randomUUID } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";
import { logger } from "../../infrastructure/logger.js";
import { interventionsFired } from "../../infrastructure/metrics.js";
import { Severity } from "../models/Severity.js";
import { IIntervention } from "../ports/out/IInterventionService.js";
import { execFile } from 'child_process'

export class InterventionService {
  private _wss: WebSocketServer | null = null;
  private readonly _clients = new Set<WebSocket>();

  start(): void {
    const port = Number(process.env.INTERVENTION_PORT) || 8001;

    this._wss = new WebSocketServer({
      host: "127.0.0.1", // Never 0.0.0.0
      port,
    });

    this._wss.on("connection", (ws) => {
      this._clients.add(ws);
      logger.debug(
        { total: this._clients.size },
        "Intervention client connected",
      );

      ws.on("close", () => {
        this._clients.delete(ws);
        logger.debug(
          { total: this._clients.size },
          "Intervention client disconnected",
        );
      });

      ws.on("error", (err) => {
        logger.warn({ err }, "Intervention WebSocket client error");
        this._clients.delete(ws);
      });
    });

    this._wss.on("error", (err) => {
      logger.error({ err }, "Intervention WebSocket server error");
    });

    logger.info(
      { port, host: "127.0.0.1" },
      "Intervention WebSocket server started",
    );
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => {
      if (!this._wss) return resolve();
      this._wss.close(() => resolve());
    });
  }

  fire(rule: string, severity: Severity, payload: { speech: string; notification: string }): IIntervention {
  const intervention: IIntervention = {
  id: randomUUID(),
  rule,
  severity,
  ts: Date.now(),

  speech: payload.speech,
  notification: payload.notification,
};

  interventionsFired.inc({ rule, severity });
  logger.info({ intervention }, "Intervention fired");

  // Broadcast full payload to WebSocket clients
  const payloadJson = JSON.stringify({
    ...intervention,
    speech: payload.speech,
    notification: payload.notification,
  });

  for (const ws of this._clients) {
    try {
      ws.send(payloadJson);
    } catch (err) {
      logger.warn({ err }, "Failed to send intervention to client");
    }
  }

  // UI notification (short text only)
  notifier.notify({
    title: "Flow Companion",
    message: payload.notification.slice(0, 80),
    sound: false,
    wait: false,
  });

  // Voice (speech only)
  if (severity === "high") {
    const spoken = payload.speech.slice(0, 120);

    execFile("say", [
      "-v",
      "Alex",
      "-r",
      "155",
      spoken,
    ]);
  }

  return intervention;
}

  get clientCount(): number {
    return this._clients.size;
  }
}

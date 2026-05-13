import notifier from "node-notifier";
import { randomUUID } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";
import { logger } from "../../infrastructure/logger.js";
import { interventionsFired } from "../../infrastructure/metrics.js";
import { Severity } from "../models/Severity.js";
import { IIntervention } from "../ports/out/IInterventionService.js";

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

  fire(rule: string, severity: Severity, message: string): IIntervention {
    const intervention: IIntervention = {
      id: randomUUID(),
      rule,
      severity,
      message,
      ts: Date.now(),
    };

    interventionsFired.inc({ rule, severity });
    logger.info({ intervention }, "Intervention fired");

    // Broadcast to all connected WebSocket clients
    const payload = JSON.stringify(intervention);
    for (const ws of this._clients) {
      try {
        ws.send(payload);
      } catch (err) {
        logger.warn({ err }, "Failed to send intervention to client");
      }
    }

    // OS toast for high severity
    if (severity === "high") {
      notifier.notify({
        title: " Flow Agent",
        message: message.slice(0, 256),
        sound: false,
        wait: false,
      });
    }

    return intervention;
  }

  get clientCount(): number {
    return this._clients.size;
  }
}

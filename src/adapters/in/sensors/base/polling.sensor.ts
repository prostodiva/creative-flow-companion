import { logger } from "../../../../infrastructure/logger.js";
import {
  sensorErrorsTotal,
  sensorTicksTotal,
} from "../../../../infrastructure/metrics.js";
import { Sensor, type SensorHealth } from "./sensor.js";

// ---- Configuration ---------------------------------------------------------

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_FLUSH_INTERVAL_MS = 5_000;

export abstract class PollingSensor<T> extends Sensor {
  protected _batch: T[] = [];
  protected _lastTickAt: number | null = null;
  protected _tickCount = 0;
  protected _errorCount = 0;

  private _pollTimer: NodeJS.Timeout | null = null;
  private _flushTimer: NodeJS.Timeout | null = null;

  protected get intervalMs(): number {
    return Number(process.env.POLL_INTERVAL_MS) || 2000;
  }

  protected get batchSize(): number {
    return DEFAULT_BATCH_SIZE;
  }

  protected get flushIntervalMs(): number {
    return DEFAULT_FLUSH_INTERVAL_MS;
  }

  protected abstract poll(): Promise<T | null>;

  protected abstract flush(batch: T[]): Promise<void>;

  start(): void {
    if (this._pollTimer) return;
    logger.info(
      { sensor: this.name, intervalMs: this.intervalMs },
      "Sensor started",
    );

    this._pollTimer = setInterval(() => void this._tick(), this.intervalMs);
    this._flushTimer = setInterval(
      () => void this._triggerFlush(),
      this.flushIntervalMs,
    );
  }

  stop(): void {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
    if (this._flushTimer) {
      clearInterval(this._flushTimer);
      this._flushTimer = null;
    }
    // Flush remaining items
    if (this._batch.length > 0) {
      void this._triggerFlush();
    }
    logger.info({ sensor: this.name }, "Sensor stopped");
  }

  health(): SensorHealth {
    return {
      name: this.name,
      status: this._pollTimer
        ? this._errorCount > 0
          ? "error"
          : "ok"
        : "idle",
      lastTickAt: this._lastTickAt,
      errorCount: this._errorCount,
      tickCount: this._tickCount,
    };
  }

  private async _tick(): Promise<void> {
    try {
      const data = await this.poll();
      this._lastTickAt = Date.now();
      this._tickCount++;
      sensorTicksTotal.inc({ sensor: this.name });

      if (data !== null) {
        this._batch.push(data);
        if (this._batch.length >= this.batchSize) {
          await this._triggerFlush();
        }
      }
    } catch (err) {
      this._errorCount++;
      sensorErrorsTotal.inc({ sensor: this.name });
      logger.error({ sensor: this.name, err }, "Poll error");
    }
  }

  private async _triggerFlush(): Promise<void> {
    if (this._batch.length === 0) return;
    const toFlush = this._batch.splice(0);
    try {
      await this.flush(toFlush);
    } catch (err) {
      logger.error(
        { sensor: this.name, err, count: toFlush.length },
        "Flush error",
      );

      this._batch.unshift(...toFlush);
    }
  }

  get batchSnapshot(): readonly T[] {
    return this._batch;
  }
}

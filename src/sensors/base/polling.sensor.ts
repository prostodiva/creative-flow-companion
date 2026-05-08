import { Sensor, type SensorHealth } from './sensor.js';
import { config } from '../../core/config.js';
import { logger } from '../../core/logger.js';
import { sensorTicksTotal, sensorErrorsTotal } from '../../core/metrics.js';
import type { AppConfig } from '../../core/config.js';

// ---- Configuration ---------------------------------------------------------

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_FLUSH_INTERVAL_MS = 5_000;

// ---- PollingSensor ---------------------------------------------------------

/**
 * Template Method base class.
 *
 * Children only implement:
 *   - `poll()` — returns data or null if nothing to record
 *   - `flush(batch)` — persists a full batch to the repository
 *   - `intervalMs` — override default poll interval (optional)
 *   - `batchSize`  — override default batch size (optional)
 */
export abstract class PollingSensor<T> extends Sensor {
  protected _batch: T[] = [];
  protected _lastTickAt: number | null = null;
  protected _tickCount = 0;
  protected _errorCount = 0;

  private _pollTimer: NodeJS.Timeout | null = null;
  private _flushTimer: NodeJS.Timeout | null = null;

  /** Override to provide a sensor-specific interval; falls back to config */
  protected get intervalMs(): number {
    return config.get().POLL_INTERVAL_MS;
  }

  protected get batchSize(): number {
    return DEFAULT_BATCH_SIZE;
  }

  protected get flushIntervalMs(): number {
    return DEFAULT_FLUSH_INTERVAL_MS;
  }

  // ---- Abstract -------------------------------------------------------

  /** Called every interval. Return data to batch, or null to skip. */
  protected abstract poll(): Promise<T | null>;

  /** Persist the accumulated batch. Called when batch is full or flush timer fires. */
  protected abstract flush(batch: T[]): Promise<void>;

  // ---- Template Method ------------------------------------------------

  start(): void {
    if (this._pollTimer) return; // already running
    logger.info({ sensor: this.name, intervalMs: this.intervalMs }, 'Sensor started');

    this._pollTimer = setInterval(() => void this._tick(), this.intervalMs);
    this._flushTimer = setInterval(() => void this._triggerFlush(), this.flushIntervalMs);

    // Hot-reload: restart interval if POLL_INTERVAL_MS changes
    config.on('change', (cfg: AppConfig) => this._onConfigChange(cfg));
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
    logger.info({ sensor: this.name }, 'Sensor stopped');
  }

  health(): SensorHealth {
    return {
      name: this.name,
      status: this._pollTimer
        ? this._errorCount > 0
          ? 'error'
          : 'ok'
        : 'idle',
      lastTickAt: this._lastTickAt,
      errorCount: this._errorCount,
      tickCount: this._tickCount,
    };
  }

  // ---- Internal -------------------------------------------------------

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
      logger.error({ sensor: this.name, err }, 'Poll error');
    }
  }

  private async _triggerFlush(): Promise<void> {
    if (this._batch.length === 0) return;
    const toFlush = this._batch.splice(0);
    try {
      await this.flush(toFlush);
    } catch (err) {
      logger.error({ sensor: this.name, err, count: toFlush.length }, 'Flush error');
      // Return items to front of batch to retry
      this._batch.unshift(...toFlush);
    }
  }

  private _onConfigChange(cfg: AppConfig): void {
    // Only restart if this sensor uses the global interval
    if (this.intervalMs !== cfg.POLL_INTERVAL_MS) return;
    if (!this._pollTimer) return;

    clearInterval(this._pollTimer);
    this._pollTimer = setInterval(() => void this._tick(), cfg.POLL_INTERVAL_MS);
    logger.info(
      { sensor: this.name, intervalMs: cfg.POLL_INTERVAL_MS },
      'Poll interval updated'
    );
  }

  // Expose for testing
  get batchSnapshot(): readonly T[] {
    return this._batch;
  }
}
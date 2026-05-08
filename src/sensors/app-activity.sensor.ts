import { PollingSensor } from './base/polling.sensor.js';
import type { AppRepo } from '../repos/app.repo.js';
import { redact } from '../utils/redact.js';
import { logger } from '../core/logger.js';
import { config } from '../core/config.js';

// ---- Types -----------------------------------------------------------------

interface AppEvent {
  ts: number;
  app: string;
  title: string;
  duration_ms: number;
}

// ---- Sensor ----------------------------------------------------------------

export class AppActivitySensor extends PollingSensor<AppEvent> {
  readonly name = 'app-activity';

  protected override get intervalMs(): number {
    return Math.max(config.get().POLL_INTERVAL_MS, 2_000); // minimum 2 s
  }

  private readonly _repo: AppRepo;
  private _lastApp = '';
  private _lastAppStart = 0;
  private _switchHistory: number[] = []; // timestamps of app switches

  constructor(repo: AppRepo) {
    super();
    this._repo = repo;
  }

  protected async poll(): Promise<AppEvent | null> {
    const activeWin = (await import('active-win')).default;
    const win = await activeWin();
    if (!win) return null;

    const app = win.owner.name.slice(0, 200);
    const title = redact(win.title ?? '');
    const now = Date.now();

    if (app !== this._lastApp) {
      // Track switch time for thrashing detection
      this._switchHistory.push(now);
      // Keep only last 5 min of history
      const cutoff = now - 5 * 60 * 1000;
      this._switchHistory = this._switchHistory.filter((t) => t >= cutoff);

      this._lastApp = app;
      this._lastAppStart = now;
    }

    const duration_ms = now - this._lastAppStart;

    return { ts: now, app, title, duration_ms };
  }

  protected async flush(batch: AppEvent[]): Promise<void> {
    await this._repo.insertMany(batch);
    logger.debug({ sensor: this.name, count: batch.length }, 'Flushed app events');
  }

  /** Returns app switch timestamps in the last windowMs */
  getSwitchesInWindow(windowMs: number): number {
    const cutoff = Date.now() - windowMs;
    return this._switchHistory.filter((t) => t >= cutoff).length;
  }
}
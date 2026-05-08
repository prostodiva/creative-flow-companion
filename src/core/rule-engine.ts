import type { AppRepo } from '../repos/app.repo.js';
import type { IdeRepo } from '../repos/ide.repo.js';
import type { InterventionService } from './intervention.service.js';
import type { IdeSensor } from '../sensors/ide/ide.sensor.js';
import type { AppActivitySensor } from '../sensors/app-activity.sensor.js';
import { logger } from './logger.js';

// ---- Configuration ---------------------------------------------------------

const EVAL_INTERVAL_MS = 30_000; // 30 s

/** Apps considered "productive" — distraction check ignores these */
const PRODUCTIVE_APPS = ['Code', 'code', 'Rider', 'rider', 'Terminal', 'iTerm2', 'Figma', 'zsh', 'bash', 'fish'];

// Thresholds
const DISTRACTED_WINDOW_MS  = 15 * 60 * 1000;  // 15 min window
const DISTRACTED_LIMIT_MS   = 10 * 60 * 1000;  // >10 min distracted
const STUCK_WINDOW_MS       = 5  * 60 * 1000;  // 5 min IDE open
const STUCK_KEYSTROKE_LIMIT = 10;               // fewer than 10 keystrokes
const THRASH_WINDOW_MS      = 2  * 60 * 1000;  // 2 min window
const THRASH_SWITCH_LIMIT   = 5;               // >5 switches

// ---- Engine ----------------------------------------------------------------

export class RuleEngine {
  private _timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly appRepo: AppRepo,
    private readonly ideRepo: IdeRepo,
    private readonly interventionSvc: InterventionService,
    private readonly ideSensor: IdeSensor,
    private readonly appSensor: AppActivitySensor,
  ) {}

  start(): void {
    if (this._timer) return;
    this._timer = setInterval(() => void this._evaluate(), EVAL_INTERVAL_MS);
    logger.info({ intervalMs: EVAL_INTERVAL_MS }, 'Rule engine started');
  }

  stop(): void {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  // ---- Rules ---------------------------------------------------------------

  private async _evaluate(): Promise<void> {
    const now = Date.now();

    await Promise.all([
      this._checkDistracted(now),
      this._checkStuck(now),
      this._checkThrashing(),
    ]);
  }

  /** Rule 1 — Distracted: >10 min of last 15 min in non-productive apps */
  private async _checkDistracted(now: number): Promise<void> {
    try {
      const fromMs = now - DISTRACTED_WINDOW_MS;
      const distractedMs = await this.appRepo.getDistractedDurationMs(
        fromMs, now, PRODUCTIVE_APPS
      );

      if (distractedMs > DISTRACTED_LIMIT_MS) {
        const minutes = Math.round(distractedMs / 60_000);
        this.interventionSvc.fire(
          'distracted',
          'med',
          `You've been off-task for ~${minutes} min in the last 15 min. Time to refocus?`
        );
      }
    } catch (err) {
      logger.error({ err, rule: 'distracted' }, 'Rule evaluation failed');
    }
  }

  /** Rule 2 — Stuck: IDE open >5 min, <10 keystrokes, no commits */
  private async _checkStuck(now: number): Promise<void> {
    try {
      const fromMs = now - STUCK_WINDOW_MS;
      const [ideDurationMs, keystrokeCount] = await Promise.all([
        this.ideRepo.getIdeDurationMs(fromMs, now),
        this.ideRepo.getKeystrokeCount(fromMs, now),
      ]);

      const ideActiveEnough = ideDurationMs >= STUCK_WINDOW_MS;
      const noKeystrokes = keystrokeCount < STUCK_KEYSTROKE_LIMIT;

      if (ideActiveEnough && noKeystrokes) {
        this.interventionSvc.fire(
          'stuck',
          'high',
          `You've had the IDE open for 5+ min with only ${keystrokeCount} keystrokes. Stuck? Try rubber-duck debugging or a short break.`
        );
      }
    } catch (err) {
      logger.error({ err, rule: 'stuck' }, 'Rule evaluation failed');
    }
  }

  /** Rule 3 — Thrashing: >5 app switches in 2 min */
  private _checkThrashing(): void {
    try {
      const switches = this.appSensor.getSwitchesInWindow(THRASH_WINDOW_MS);
      if (switches > THRASH_SWITCH_LIMIT) {
        this.interventionSvc.fire(
          'thrashing',
          'low',
          `${switches} app switches in the last 2 min — context-switching costs you ~23 min of focus. Pick one thing.`
        );
      }
    } catch (err) {
      logger.error({ err, rule: 'thrashing' }, 'Rule evaluation failed');
    }
  }
}
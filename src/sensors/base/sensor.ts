// ---- Types -----------------------------------------------------------------

export interface SensorHealth {
  name: string;
  status: 'ok' | 'error' | 'idle';
  lastTickAt: number | null;
  errorCount: number;
  tickCount: number;
}

// ---- Abstract base ---------------------------------------------------------

/**
 * Abstract Sensor.
 * Concrete sensors must implement `start()`, `stop()`, and `health()`.
 * PollingSensor provides a Template Method implementation of those via
 * `poll()`.
 */
export abstract class Sensor {
  abstract readonly name: string;

  abstract start(): void;
  abstract stop(): void;
  abstract health(): SensorHealth;
}
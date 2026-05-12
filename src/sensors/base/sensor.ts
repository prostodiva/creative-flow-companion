
export interface SensorHealth {
  name: string;
  status: "ok" | "error" | "idle";
  lastTickAt: number | null;
  errorCount: number;
  tickCount: number;
}

export abstract class Sensor {
  abstract readonly name: string;
  abstract start(): void;
  abstract stop(): void;
  abstract health(): SensorHealth;
}

import {
  Registry,
  Counter,
  Histogram,
  collectDefaultMetrics,
} from "prom-client";

export const registry = new Registry();

collectDefaultMetrics({ register: registry });

export const sensorTicksTotal = new Counter({
  name: "sensor_ticks_total",
  help: "Total number of sensor poll ticks",
  labelNames: ["sensor"] as const,
  registers: [registry],
});

export const sensorErrorsTotal = new Counter({
  name: "sensor_errors_total",
  help: "Total number of sensor poll errors",
  labelNames: ["sensor"] as const,
  registers: [registry],
});

export const dbQueryDuration = new Histogram({
  name: "db_query_duration_seconds",
  help: "Database query duration in seconds",
  labelNames: ["operation"] as const,
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [registry],
});

export const interventionsFired = new Counter({
  name: "interventions_fired_total",
  help: "Total interventions fired by rule name",
  labelNames: ["rule", "severity"] as const,
  registers: [registry],
});

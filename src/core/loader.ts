import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
import { glob } from 'glob';
import { Sensor } from '../sensors/base/sensor.js';
import { logger } from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Scans for sensor files and dynamically imports them.
 *
 * In production (running from dist/):  looks for dist/sensors/**\/*.sensor.js
 * In development (running via tsx):    looks for src/sensors/**\/*.sensor.ts
 *
 * Each sensor file must have a DEFAULT export that is a class extending Sensor.
 * The factory function receives the injected dependencies object and returns
 * a Sensor instance (or null to skip).
 */

export type SensorFactory = (deps: SensorDeps) => Sensor | null;

export interface SensorDeps {
  // Repos are passed in from main so sensors never import getDB directly
  [key: string]: unknown;
}

interface SensorModule {
  default: new (deps: SensorDeps) => Sensor;
}

function isSensorClass(val: unknown): val is new (...args: unknown[]) => Sensor {
  return (
    typeof val === 'function' &&
    (val === Sensor || val.prototype instanceof Sensor)
  );
}

export async function loadSensors(deps: SensorDeps): Promise<Sensor[]> {
  // Detect dev vs prod by checking if this file is a .ts or .js module
  const isTsx = import.meta.url.endsWith('.ts');
  const rootDir = isTsx
    ? resolve(__dirname, '../../src')        // tsx: project root/src
    : resolve(__dirname, '..');             // dist: project root/dist

  const pattern = isTsx
    ? join(rootDir, 'sensors/**/*.sensor.ts').replace(/\\/g, '/')
    : join(rootDir, 'sensors/**/*.sensor.js').replace(/\\/g, '/');

  const files = await glob(pattern);
  logger.debug({ pattern, found: files.length }, 'Sensor discovery');

  const sensors: Sensor[] = [];

  for (const file of files) {
    try {
      const url = new URL(`file://${file}`);
      const mod = await import(url.href) as Partial<SensorModule>;

      if (!mod.default || !isSensorClass(mod.default)) {
        logger.warn({ file }, 'Sensor file has no default Sensor class export, skipping');
        continue;
      }

      // Sensors receive the whole deps bag; constructor ignores what it doesn't need
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const instance = new (mod.default as any)(deps);
      sensors.push(instance);
      logger.info({ sensor: instance.name, file }, 'Sensor loaded');
    } catch (err) {
      logger.error({ file, err }, 'Failed to load sensor module');
    }
  }

  return sensors;
}
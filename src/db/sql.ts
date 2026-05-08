import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const cache = new Map<string, string>();

function projectRoot(): string {
  // `src/db/sql.ts` -> project root
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..', '..');
}

/**
 * Loads a `.sql` asset from `db/` with a stable runtime path in both:
 * - dev: running from `src/`
 * - prod: running from `dist/` (assets are copied into `dist/db/`)
 */
export function loadSql(assetPathFromDbRoot: string): string {
  const key = assetPathFromDbRoot.replace(/\\/g, '/');
  const hit = cache.get(key);
  if (hit) return hit;

  // Prefer dist/db in prod builds, fall back to repo db/ in dev.
  const root = projectRoot();
  const distCandidate = resolve(root, 'dist', 'db', key);
  const devCandidate = resolve(root, 'db', key);

  let sql: string;
  try {
    sql = readFileSync(distCandidate, 'utf8');
  } catch {
    sql = readFileSync(devCandidate, 'utf8');
  }

  cache.set(key, sql);
  return sql;
}


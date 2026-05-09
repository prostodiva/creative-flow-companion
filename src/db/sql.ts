import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const cache = new Map<string, string>();

function projectRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "..", "..");
}

export function loadSql(assetPathFromDbRoot: string): string {
  const key = assetPathFromDbRoot.replace(/\\/g, "/");
  const hit = cache.get(key);
  if (hit) return hit;

  const root = projectRoot();
  const distCandidate = resolve(root, "dist", "db", key);
  const devCandidate = resolve(root, "db", key);

  let sql: string;
  try {
    sql = readFileSync(distCandidate, "utf8");
  } catch {
    sql = readFileSync(devCandidate, "utf8");
  }

  cache.set(key, sql);
  return sql;
}

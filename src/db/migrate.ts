import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type Database from "better-sqlite3";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

type Migration = {
  id: string;
  filename: string;
  upSql: string;
  downSql: string;
};

function splitUpDown(sql: string): { up: string; down: string } {
  const upMarker = /^\s*--\s*up\s*$/im;
  const downMarker = /^\s*--\s*down\s*$/im;

  const upIdx = sql.search(upMarker);
  const downIdx = sql.search(downMarker);

  if (upIdx === -1) {
    return { up: sql.trim(), down: "" };
  }

  if (downIdx === -1) {
    const up = sql.slice(upIdx).replace(upMarker, "").trim();
    return { up, down: "" };
  }

  const up = sql.slice(upIdx, downIdx).replace(upMarker, "").trim();
  const down = sql.slice(downIdx).replace(downMarker, "").trim();
  return { up, down };
}

function migrationsDirCandidates(): string[] {
  const here = dirname(fileURLToPath(import.meta.url)); 
  const projectRoot = resolve(here, "..", "..");
  return [
    resolve(projectRoot, "dist", "db", "migrations"),
    resolve(projectRoot, "db", "migrations"),
  ];
}

function readMigrations(): Migration[] {
  const dirs = migrationsDirCandidates();
  let dir: string | null = null;
  for (const d of dirs) {
    try {
      readdirSync(d);
      dir = d;
      break;
    } catch {
    }
  }
  if (!dir) return [];

  const files = readdirSync(dir)
    .filter((f) => /^\d{3}_.+\.sql$/i.test(f))
    .sort((a, b) => a.localeCompare(b));

  return files.map((filename) => {
    const full = resolve(dir!, filename);
    const raw = readFileSync(full, "utf8");
    const { up, down } = splitUpDown(raw);
    return {
      id: filename.slice(0, 3),
      filename,
      upSql: up,
      downSql: down,
    };
  });
}

function execTolerant(db: Database.Database, sql: string): void {
  const statements = sql
    .split(/;\s*(?:\r?\n|$)/g)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const stmt of statements) {
    try {
      db.exec(`${stmt};`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        /duplicate column name/i.test(msg) ||
        /duplicate\s+column/i.test(msg) ||
        /already exists/i.test(msg)
      ) {
        continue;
      }
      throw err;
    }
  }
}

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);

  const applied = new Set(
    db
      .prepare(`SELECT id FROM schema_migrations ORDER BY id`)
      .all()
      .map((r) => String((r as { id: unknown }).id)),
  );

  const migrations = readMigrations();
  if (migrations.length === 0) return;

  for (const m of migrations) {
    if (applied.has(m.id)) continue;

    const tx = db.transaction(() => {
      if (m.upSql) execTolerant(db, m.upSql);
      db.prepare(
        `INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)`,
      ).run([m.id, Date.now()]);
    });
    tx();
  }
}

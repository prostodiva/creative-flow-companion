-- up
CREATE TABLE IF NOT EXISTS app_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  app TEXT NOT NULL,
  title TEXT NOT NULL,
  domain TEXT,
  is_fullscreen INTEGER DEFAULT 0,
  has_audio INTEGER DEFAULT 0,
  category TEXT,
  duration_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_app_activity_ts ON app_activity(ts);

CREATE TABLE IF NOT EXISTS title_classifications (
  title_hash TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  domain TEXT,
  category TEXT NOT NULL,
  classified_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ide_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  file TEXT NOT NULL,
  event_type TEXT NOT NULL,
  project TEXT
);

CREATE INDEX IF NOT EXISTS idx_ide_events_ts ON ide_events(ts);

CREATE TABLE IF NOT EXISTS ide_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  project TEXT NOT NULL,
  file TEXT NOT NULL,
  duration_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Track applied migrations
CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

-- down
-- (No-op rollback. This daemon is local-first and migrations are forward-only by default.)

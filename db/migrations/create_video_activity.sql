-- 003_create_video_activity.sql
CREATE TABLE IF NOT EXISTS video_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  url TEXT NOT NULL,
  title TEXT,
  category TEXT NOT NULL CHECK(category IN ('entertainment', 'work')),
  duration_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_video_ts ON video_activity(ts);
CREATE INDEX IF NOT EXISTS idx_video_category ON video_activity(category, ts);
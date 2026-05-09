-- ActiveContextTracker: tracks only files/apps used in last 15 minutes
-- Auto-expires via cleanup job. Used to prevent stale context in prompts.

CREATE TABLE IF NOT EXISTS active_work_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,           -- Unix timestamp in milliseconds
  app_name TEXT NOT NULL,               -- "VSCode", "Safari", "Chrome", "Xcode"
  file_path TEXT NOT NULL,              -- "/project/Player.cs" or "youtube.com/watch?v=..."
  window_title TEXT,                    -- "Player.cs — project" or "quaternions explained"
  is_coding BOOLEAN NOT NULL DEFAULT 0, -- 1 if VSCode/Xcode, 0 if browser/others
  duration_ms INTEGER DEFAULT 5000      -- How long this poll represents, default 5s
);

-- Index for fast cleanup of old sessions: DELETE WHERE timestamp < cutoff
CREATE INDEX IF NOT EXISTS idx_active_sessions_timestamp 
ON active_work_sessions(timestamp);

-- Index for querying coding activity fast
CREATE INDEX IF NOT EXISTS idx_active_sessions_coding 
ON active_work_sessions(is_coding, timestamp);

-- Index for getting distinct files quickly
CREATE INDEX IF NOT EXISTS idx_active_sessions_file 
ON active_work_sessions(file_path, timestamp);
ALTER TABLE app_activity ADD COLUMN domain TEXT;
ALTER TABLE app_activity ADD COLUMN is_fullscreen INTEGER DEFAULT 0;
ALTER TABLE app_activity ADD COLUMN has_audio INTEGER DEFAULT 0;
ALTER TABLE app_activity ADD COLUMN category TEXT;

CREATE INDEX IF NOT EXISTS idx_app_activity_domain ON app_activity(domain);
CREATE INDEX IF NOT EXISTS idx_app_activity_category ON app_activity(category);
CREATE INDEX IF NOT EXISTS idx_app_activity_video ON app_activity(is_fullscreen, has_audio, ts);

CREATE TABLE IF NOT EXISTS title_classifications (
  title_hash TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  domain TEXT,
  category TEXT NOT NULL,
  classified_at INTEGER NOT NULL
);
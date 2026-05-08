-- up
ALTER TABLE app_activity ADD COLUMN chrome_tab_count INTEGER;

CREATE INDEX IF NOT EXISTS idx_app_activity_chrome_tabs ON app_activity(app, chrome_tab_count, ts);

-- down
-- SQLite cannot drop columns without table rebuild; keep as no-op.


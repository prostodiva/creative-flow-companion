UPDATE app_activity
SET category = ?
WHERE id = ? AND (category = 'raw' OR category IS NULL OR category = '')
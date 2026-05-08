SELECT COALESCE(SUM(duration_ms), 0) as total
FROM ide_activity
WHERE ts BETWEEN ? AND ?;


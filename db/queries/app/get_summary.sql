SELECT app, SUM(duration_ms) as total_ms, COUNT(*) as tab_count
FROM app_activity
WHERE ts BETWEEN ? AND ?
GROUP BY app;


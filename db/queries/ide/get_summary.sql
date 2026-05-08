SELECT project, file, SUM(duration_ms) as total_ms
FROM ide_activity
WHERE ts BETWEEN ? AND ?
GROUP BY project, file;


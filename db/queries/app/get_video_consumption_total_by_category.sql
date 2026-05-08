SELECT COALESCE(SUM(duration_ms), 0) AS total
FROM app_activity
WHERE ts BETWEEN ? AND ?
  AND category IN (?, ?);


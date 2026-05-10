-- App usage breakdown over a time window, ordered by total time spent.
-- Params: $1=fromMs, $2=toMs

SELECT   app_name,
         SUM(duration_ms) AS total_ms
FROM     active_work_sessions
WHERE    timestamp BETWEEN ? AND ?
GROUP BY app_name
ORDER BY total_ms DESC;
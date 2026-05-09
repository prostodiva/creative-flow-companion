-- Prune rows older than the 15-minute window.
-- Param: $1 = cutoff timestamp ms (Date.now() - 15min)

DELETE FROM active_work_sessions
WHERE timestamp < ?;
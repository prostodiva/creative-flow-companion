-- Files touched between two timestamps (used by sessionLogger for 30min windows).
-- Distinct coding files only. Params: $1=fromMs, $2=toMs, $3=limit

SELECT DISTINCT file_path AS file
FROM   active_work_sessions
WHERE  timestamp   BETWEEN ? AND ?
  AND  is_coding   = 1
  AND  file_path   NOT IN ('__no_file__', '')
ORDER  BY timestamp DESC
LIMIT  ?;
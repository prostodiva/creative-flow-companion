-- Returns distinct coding files touched in the last 15 minutes.
-- Aliased as "file" so IdeRepo cast { file: string } needs no changes.
-- Params: $1 = cutoff timestamp ms (Date.now() - 15min), $2 = limit

SELECT DISTINCT file_path AS file
FROM   active_work_sessions
WHERE  timestamp > ?
  AND  is_coding  = 1
  AND  file_path NOT IN ('__no_file__', '')
ORDER  BY timestamp DESC
LIMIT  ?;
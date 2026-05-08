SELECT file
FROM ide_events
WHERE ts > ?
ORDER BY ts DESC
LIMIT ?;


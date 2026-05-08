SELECT COUNT(*) as cnt
FROM ide_events
WHERE ts BETWEEN ? AND ?
  AND event_type = 'keystroke';


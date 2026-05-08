SELECT COUNT(*) as count
FROM ide_events
WHERE ts > ?
  AND event_type = 'keystroke';


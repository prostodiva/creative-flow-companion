SELECT COALESCE(SUM(duration_ms), 0) as total
FROM app_activity
WHERE ts > ?1
  AND ts <= ?2
  AND has_audio = 1
  AND category = ?3;

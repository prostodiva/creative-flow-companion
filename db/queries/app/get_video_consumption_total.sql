SELECT COALESCE(SUM(duration_ms), 0) as total
FROM app_activity 
WHERE ts > ? 
  AND ts <= ? 
  AND has_audio = 1;

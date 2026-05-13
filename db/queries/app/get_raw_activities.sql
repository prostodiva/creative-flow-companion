SELECT 
  id,
  ts,
  app AS appName,
  title AS windowTitle,
  domain,
  category,
  duration_ms AS durationMs
FROM app_activity
WHERE category = 'raw' OR category IS NULL
ORDER BY ts ASC
LIMIT ?;
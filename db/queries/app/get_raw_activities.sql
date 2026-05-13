SELECT 
  id, 
  ts, 
  app, 
  title, 
  domain,
  NULL as url,
  has_audio as audible,
  is_fullscreen as fullscreen
FROM app_activity
WHERE category = 'raw' OR category IS NULL OR category = ''
ORDER BY ts ASC
LIMIT ?
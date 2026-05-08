SELECT chrome_tab_count as count
FROM app_activity
WHERE app = 'Google Chrome'
  AND ts > ?
  AND chrome_tab_count IS NOT NULL
ORDER BY ts DESC
LIMIT 1;


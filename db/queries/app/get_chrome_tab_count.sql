SELECT COALESCE(MAX(chrome_tab_count), 0) as count
FROM app_activity
WHERE ts > ?
  AND chrome_tab_count > 0;


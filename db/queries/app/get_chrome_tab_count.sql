SELECT COUNT(*) as count
FROM app_activity
WHERE app = 'Google Chrome' AND ts > ?;


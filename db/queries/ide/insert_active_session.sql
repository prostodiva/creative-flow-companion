-- Called every 5s by the sensor polling loop.
-- Params: $1=timestamp ms, $2=app_name, $3=file_path, $4=window_title, $5=is_coding, $6=duration_ms

INSERT INTO active_work_sessions
  (timestamp, app_name, file_path, window_title, is_coding, duration_ms)
VALUES
  (?, ?, ?, ?, ?, ?);
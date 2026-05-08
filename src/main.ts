import Database from 'better-sqlite3'
import { existsSync, unlinkSync } from 'fs'
import { AppRepo } from './repos/app.repo.js'
import { IdeRepo } from './repos/ide.repo.js'
import { InterventionService } from './core/intervention.service.js'
import { AppActivitySensor } from './sensors/app-activity.sensor.js'
import { IdeSensor } from './sensors/ide/ide.sensor.js'
import { startOrchestrationLoop } from './core/orchestrator.js'
import { logger } from './core/logger.js'

const DB_PATH = '/Users/evolvers/.flow-agent/context.db'

// Delete if corrupt/empty
if (existsSync(DB_PATH)) {
  try {
    const testDb = new Database(DB_PATH, { readonly: true })
    testDb.close()
  } catch (err) {
    logger.warn('DB corrupt, deleting and recreating')
    unlinkSync(DB_PATH)
  }
}

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL') // Better for concurrent reads/writes

// Run migrations
db.exec(`
  CREATE TABLE IF NOT EXISTS app_activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    app TEXT NOT NULL,
    title TEXT NOT NULL,
    domain TEXT,
    is_fullscreen INTEGER DEFAULT 0,
    has_audio INTEGER DEFAULT 0,
    category TEXT,
    duration_ms INTEGER NOT NULL
  );
  
  CREATE INDEX IF NOT EXISTS idx_app_activity_ts ON app_activity(ts);
  
  CREATE TABLE IF NOT EXISTS title_classifications (
    title_hash TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    domain TEXT,
    category TEXT NOT NULL,
    classified_at INTEGER NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS ide_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    file TEXT NOT NULL,
    event_type TEXT NOT NULL,
    project TEXT
  );
  
  CREATE INDEX IF NOT EXISTS idx_ide_events_ts ON ide_events(ts);
  
  CREATE TABLE IF NOT EXISTS ide_activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    project TEXT NOT NULL,
    file TEXT NOT NULL,
    duration_ms INTEGER NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`)

const appRepo = new AppRepo(db)
const ideRepo = new IdeRepo(db)
const interventionService = new InterventionService()

const appSensor = new AppActivitySensor(appRepo)
const ideSensor = new IdeSensor(ideRepo)

appSensor.start()
ideSensor.start()

startOrchestrationLoop({ appRepo, ideRepo, interventionService })

logger.info('Flow Agent Telemetry v2 ready')

process.on('SIGINT', () => {
  logger.info('Shutting down...')
  appSensor.stop()
  ideSensor.stop()
  db.close()
  process.exit(0)
})
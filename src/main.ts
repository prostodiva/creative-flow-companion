import 'dotenv/config' 
import Database from 'better-sqlite3'
import { existsSync, unlinkSync } from 'fs'
import { AppRepo } from './repos/app.repo.js'
import { IdeRepo } from './repos/ide.repo.js'
import { InterventionService } from './core/intervention.service.js'
import { AppActivitySensor } from './sensors/app-activity.sensor.js'
import { IdeSensor } from './sensors/ide/ide.sensor.js'
import { startOrchestrationLoop } from './core/orchestrator.js'
import { logger } from './core/logger.js'
import { runMigrations } from './db/migrate.js'
import os from 'node:os'
import path from 'node:path'

const DB_PATH = path.join(os.homedir(), '.flow-agent', 'context.db')

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

runMigrations(db)

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
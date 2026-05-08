import { pino } from 'pino'
import { config } from './config.js'

export const logger = process.env.NODE_ENV === 'production'
  ? pino({
      level: config.get().LOG_LEVEL,
      transport: {
        target: 'pino/file',
        options: { destination: 1 }
      }
    })
  : pino({ level: config.get().LOG_LEVEL })
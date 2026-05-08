import 'dotenv/config' 
import { pino, type LevelWithSilentOrString } from 'pino'

const level = (process.env.LOG_LEVEL ?? 'info') as LevelWithSilentOrString

export const logger = process.env.NODE_ENV === 'production'
  ? pino({
      level,
      transport: {
        target: 'pino/file',
        options: { destination: 1 }
      }
    })
  : pino({ level })
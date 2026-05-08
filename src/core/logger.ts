import pino from 'pino';
import { config } from './config.js';

const isDev = process.env.NODE_ENV !== 'production';

export const logger = isDev
  ? pino({
      level: config.get().LOG_LEVEL,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        },
      },
    })
  : pino({ level: config.get().LOG_LEVEL });
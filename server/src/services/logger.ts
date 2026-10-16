import pino from 'pino';
import { config, isDev, isTest } from '../config';

export const logger = pino({
  level: isTest ? 'silent' : config.logLevel,
  transport: isDev ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } } : undefined,
});

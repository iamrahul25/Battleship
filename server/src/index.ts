import { config, isDev } from './config';
import { createGameServer } from './app';
import { logger } from './services/logger';

const server = createGameServer({ withMonitor: isDev });

await server.listen(config.port, config.host);
logger.info(`Battleship server listening on ws://${config.host}:${config.port}`);
if (isDev) logger.info(`Colyseus monitor: http://localhost:${config.port}/colyseus`);

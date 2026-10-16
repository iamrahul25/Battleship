import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT ?? 2567),
  host: process.env.HOST ?? '0.0.0.0',
  nodeEnv: process.env.NODE_ENV ?? 'development',
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  /** Seconds a dropped client may take to reconnect. */
  reconnectSeconds: Number(process.env.RECONNECT_SECONDS ?? 30),
  /** Close idle rooms nobody joined after this many ms. */
  idleRoomMs: Number(process.env.IDLE_ROOM_MS ?? 10 * 60_000),
};

export const isDev = config.nodeEnv === 'development';
export const isTest = config.nodeEnv === 'test' || process.env.VITEST !== undefined;

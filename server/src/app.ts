import { matchMaker, Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import type { Application, NextFunction, Request, Response } from 'express';
import { config } from './config';
import { BattleRoom } from './rooms/BattleRoom';
import { findRoomByCode } from './services/roomCodes';
import { parseGameMode } from './shared/engine';
import { PROTOCOL_VERSION, ROOM_NAME, roomCodeSchema } from './shared/protocol';

export interface CreateServerOptions {
  withMonitor?: boolean;
  greet?: boolean;
  gracefullyShutdown?: boolean;
}

function cors(req: Request, res: Response, next: NextFunction) {
  const allowed = config.corsOrigin.split(',').map((s) => s.trim());
  const origin = req.headers.origin;
  if (allowed.includes('*')) res.setHeader('Access-Control-Allow-Origin', '*');
  else if (origin && allowed.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return void res.sendStatus(204);
  next();
}

export async function configureRoutes(app: Application, withMonitor: boolean) {
  app.use('/health', cors);
  app.use('/rooms', cors);

  app.get('/health', async (_req, res) => {
    const rooms = await matchMaker.query({ name: ROOM_NAME });
    res.json({ ok: true, protocolVersion: PROTOCOL_VERSION, uptime: process.uptime(), rooms: rooms.length });
  });

  /** Private room lookup: code → roomId, then the client calls joinById. */
  app.get('/rooms/code/:code', (req, res) => {
    const parsed = roomCodeSchema.safeParse(req.params.code);
    const roomId = parsed.success ? findRoomByCode(parsed.data) : undefined;
    if (!roomId) return void res.status(404).json({ code: 'ROOM_NOT_FOUND', message: 'Room not found.' });
    res.json({ roomId });
  });

  if (withMonitor) {
    const { monitor } = await import('@colyseus/monitor');
    app.use('/colyseus', monitor());
  }
}

export function createGameServer(options: CreateServerOptions = {}): Server {
  const server = new Server({
    transport: new WebSocketTransport(),
    greet: options.greet ?? false,
    gracefullyShutdown: options.gracefullyShutdown ?? true,
    express: (app) => configureRoutes(app, options.withMonitor ?? false),
  });
  const battle = server.define(ROOM_NAME, BattleRoom).filterBy(['mode']);
  // Matchmaking filters on the raw client option; normalise it so older app builds share Quick Match queues.
  const filterOptions = battle.getFilterOptions.bind(battle);
  battle.getFilterOptions = (opts: Record<string, unknown> = {}) => ({ ...filterOptions(opts), mode: parseGameMode(opts.mode) });
  return server;
}

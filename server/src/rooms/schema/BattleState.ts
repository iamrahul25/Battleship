import { schema, t, type SchemaType } from '@colyseus/schema';

/** Public, synced player info. Never contains ship positions. */
export const PlayerPublic = schema(
  {
    sessionId: t.string().default(''),
    seat: t.number().default(0),
    name: t.string().default(''),
    avatarId: t.string().default('captain'),
    /** Self-reported in MVP (display only). */
    wins: t.number().default(0),
    losses: t.number().default(0),
    ready: t.boolean().default(false),
    connected: t.boolean().default(true),
    /** Epoch ms when the reconnection window closes (0 when connected). */
    reconnectDeadline: t.number().default(0),
    charge: t.number().default(0),
    /** defIds of ships this player has lost. */
    shipsSunk: t.array('string'),
    wantsRematch: t.boolean().default(false),
  },
  'PlayerPublic',
);
export type PlayerPublic = SchemaType<typeof PlayerPublic>;

export const BattleState = schema(
  {
    /** waiting | placement | battle | finished */
    phase: t.string().default('waiting'),
    players: t.map(PlayerPublic),
    activeSessionId: t.string().default(''),
    /** Server epoch ms for the current turn/placement deadline (0 = none). */
    turnDeadline: t.number().default(0),
    /** Server epoch ms when `turnDeadline` was set, so clients can correct for clock skew. */
    serverTime: t.number().default(0),
    /** True while the active player is disconnected and the turn timer is frozen. */
    paused: t.boolean().default(false),
    turnNumber: t.number().default(0),
    winnerSessionId: t.string().default(''),
    finishReason: t.string().default(''),
    mode: t.string().default('advance'),
    boardSize: t.number().default(10),
    /** none | few | many */
    obstacles: t.string().default('none'),
    code: t.string().default(''),
    isPrivate: t.boolean().default(false),
  },
  'BattleState',
);
export type BattleState = SchemaType<typeof BattleState>;

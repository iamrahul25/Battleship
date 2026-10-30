import { type Client, type Delayed, Room, ServerError } from '@colyseus/core';
import type { z } from 'zod';
import { config, isTest } from '../config';
import { logger } from '../services/logger';
import { RateLimiter } from '../services/rateLimiter';
import { generateRoomCode, registerRoomCode, unregisterRoomCode } from '../services/roomCodes';
import {
  type Action,
  applyAction,
  areAllies,
  createGame,
  createRng,
  type GameEvent,
  type GameMode,
  type GameState,
  getPublicView,
  isAlive,
  type MatchSettings,
  matchRules,
  MIN_PLAYERS,
  type ObstacleLevel,
  ONLINE_PLACEMENT_TIME_MS,
  ONLINE_TURN_TIME_MS,
  parseGameMode,
  parseTeamFormat,
  type PlayerIndex,
  playersForFormat,
  randomSeed,
  redactShotEvent,
  type RuleSet,
  STANDARD_MATCH_SETTINGS,
  standings,
  type TeamFormat,
  teamsInOrder,
  totalShips,
} from '../shared/engine';
import {
  ClientMessage,
  emoteSchema,
  ERROR_MESSAGES,
  fireSchema,
  type GameOverPayload,
  joinOptionsSchema,
  MIN_PROTOCOL_VERSION,
  MULTIPLAYER_PROTOCOL_VERSION,
  placeFleetSchema,
  PROTOCOL_VERSION,
  type ProfilePayload,
  sanitizeName,
  ServerMessage,
  type ShotResultPayload,
  type SyncPayload,
  useWeaponSchema,
} from '../shared/protocol';
import { BattleState, PlayerPublic } from './schema/BattleState';

const roomSettingsSchema = joinOptionsSchema.pick({ boardSize: true, obstacles: true, maxPlayers: true, teamFormat: true });

interface RoomSetup {
  settings: MatchSettings;
  maxPlayers: number;
  teamFormat: TeamFormat;
}

/** Private rooms play the host's table and size; Quick Match (and anything malformed) plays standard 1v1. */
function setupFromOptions(options: BattleRoomOptions): RoomSetup {
  const standard: RoomSetup = { settings: STANDARD_MATCH_SETTINGS, maxPlayers: 2, teamFormat: 'ffa' };
  if (!options.private) return standard;
  const parsed = roomSettingsSchema.safeParse(options);
  if (!parsed.success) return standard;
  const teamFormat = parseTeamFormat(parsed.data.teamFormat);
  return {
    settings: {
      boardSize: parsed.data.boardSize ?? STANDARD_MATCH_SETTINGS.boardSize,
      obstacles: parsed.data.obstacles ?? STANDARD_MATCH_SETTINGS.obstacles,
    },
    maxPlayers: playersForFormat(teamFormat, parsed.data.maxPlayers ?? 2),
    teamFormat,
  };
}

/** Bigger fleets get a little longer to deploy (5 s per ship beyond the classic five). */
function placementTimeFor(settings: MatchSettings, mode: GameMode): number {
  const ships = totalShips(matchRules(mode, settings));
  return ONLINE_PLACEMENT_TIME_MS + Math.max(0, ships - 5) * 5_000;
}

export interface BattleRoomOptions {
  mode?: string;
  private?: boolean;
  boardSize?: number;
  obstacles?: ObstacleLevel;
  maxPlayers?: number;
  teamFormat?: string;
  /** Test hooks. */
  turnTimeMs?: number;
  placementTimeMs?: number;
  reconnectSeconds?: number;
  seed?: number;
}

interface Seat {
  sessionId: string;
  index: PlayerIndex;
  profile: ProfilePayload;
}

export class BattleRoom extends Room<{ state: BattleState }> {
  override maxClients = 2;
  override maxMessagesPerSecond = 30;

  game: GameState | null = null;
  rules!: RuleSet;
  /** In join order; `index` is the engine seat once a game exists. */
  seats: Seat[] = [];
  teamFormat: TeamFormat = 'ffa';

  private turnTimer: Delayed | null = null;
  private pausedRemainingMs: number | null = null;
  private idleTimer: Delayed | null = null;
  private limiter = new RateLimiter(5, 5);
  private emoteLimiter = new RateLimiter(0.5, 2);
  private reconnectSeconds = config.reconnectSeconds;
  private seed: number | undefined;

  override onCreate(options: BattleRoomOptions & { protocolVersion?: number }) {
    const mode = parseGameMode(options.mode);
    // Timing/seed overrides come from client join options, so only honour them under test.
    const hooks: BattleRoomOptions = isTest ? options : {};
    const { settings, maxPlayers, teamFormat } = setupFromOptions(options);
    this.rules = matchRules(mode, settings, {
      turnTimeMs: hooks.turnTimeMs ?? ONLINE_TURN_TIME_MS,
      placementTimeMs: hooks.placementTimeMs ?? placementTimeFor(settings, mode),
    });
    this.reconnectSeconds = hooks.reconnectSeconds ?? config.reconnectSeconds;
    this.seed = hooks.seed;
    this.maxClients = maxPlayers;
    this.teamFormat = teamFormat;
    this.state = new BattleState();
    this.state.mode = mode;
    this.state.boardSize = settings.boardSize;
    this.state.obstacles = settings.obstacles;
    this.state.maxPlayers = maxPlayers;
    this.state.teamFormat = teamFormat;

    if (options.private) {
      const code = generateRoomCode();
      this.state.code = code;
      this.state.isPrivate = true;
      registerRoomCode(code, this.roomId);
      this.setPrivate(true);
    }
    this.setMetadata({ mode, code: this.state.code, maxPlayers, teamFormat, ...settings });

    this.idleTimer = this.clock.setTimeout(() => {
      if (this.state.phase === 'waiting') this.disconnect();
    }, config.idleRoomMs);

    this.onMessage(ClientMessage.PlaceFleet, (client, raw) =>
      this.guarded(client, placeFleetSchema, raw, (msg, seat) => {
        const ok = this.dispatch(
          {
            type: 'PLACE_FLEET',
            player: seat.index,
            ships: msg.ships.map((s) => ({
              uid: '',
              defId: s.defId,
              origin: { x: s.x, y: s.y },
              rotation: s.rotation,
              cells: [],
              hits: 0,
            })),
            mines: msg.mines?.map((m) => ({ x: m.x, y: m.y })),
          },
          client,
        );
        if (ok) client.send(ServerMessage.YourFleet, this.game!.players[seat.index].board.ships);
      }),
    );
    this.onMessage(ClientMessage.Ready, (client) =>
      this.guarded(client, null, {}, (_msg, seat) => this.dispatch({ type: 'READY', player: seat.index }, client)),
    );
    this.onMessage(ClientMessage.Fire, (client, raw) =>
      this.guarded(client, fireSchema, raw, (msg, seat) =>
        this.dispatch({ type: 'FIRE', player: seat.index, target: { x: msg.x, y: msg.y }, targetPlayer: msg.targetPlayer }, client),
      ),
    );
    this.onMessage(ClientMessage.UseWeapon, (client, raw) =>
      this.guarded(client, useWeaponSchema, raw, (msg, seat) =>
        this.dispatch(
          {
            type: 'USE_WEAPON',
            player: seat.index,
            weaponId: msg.weaponId,
            target: { x: msg.x, y: msg.y },
            targetPlayer: msg.targetPlayer,
          },
          client,
        ),
      ),
    );
    this.onMessage(ClientMessage.Forfeit, (client) =>
      this.guarded(client, null, {}, (_msg, seat) => this.dispatch({ type: 'FORFEIT', player: seat.index }, client)),
    );
    this.onMessage(ClientMessage.Emote, (client, raw) => {
      const parsed = emoteSchema.safeParse(raw);
      if (!parsed.success || !this.emoteLimiter.take(client.sessionId)) return;
      this.broadcast(ServerMessage.Emote, { sessionId: client.sessionId, id: parsed.data.id });
    });
    this.onMessage(ClientMessage.Rematch, (client) => this.guarded(client, null, {}, () => this.voteRematch(client)));
    this.onMessage(ClientMessage.Start, (client) => this.startEarly(client));
  }

  override onAuth(_client: Client, options: unknown) {
    const parsed = joinOptionsSchema.safeParse(options);
    if (!parsed.success) throw new ServerError(4400, 'INVALID_MESSAGE');
    const version = parsed.data.protocolVersion;
    if (version < MIN_PROTOCOL_VERSION || version > PROTOCOL_VERSION) throw new ServerError(4426, 'PROTOCOL_MISMATCH');
    if (this.maxClients > 2 && version < MULTIPLAYER_PROTOCOL_VERSION) throw new ServerError(4426, 'PROTOCOL_MISMATCH');
    return true;
  }

  override onJoin(client: Client, options: unknown) {
    const parsed = joinOptionsSchema.parse(options);
    const profile = {
      ...parsed.profile,
      name: sanitizeName(parsed.profile.name) ?? `Sailor${Math.floor(Math.random() * 900 + 100)}`,
    };
    const taken = new Set(this.seats.map((s) => s.index));
    let index = 0;
    while (taken.has(index)) index++;
    this.seats.push({ sessionId: client.sessionId, index, profile });

    const p = new PlayerPublic();
    p.sessionId = client.sessionId;
    p.seat = index;
    p.name = profile.name;
    p.avatarId = profile.avatarId;
    p.wins = profile.wins;
    p.losses = profile.losses;
    this.state.players.set(client.sessionId, p);
    if (!this.state.hostSessionId) this.state.hostSessionId = client.sessionId;
    logger.info({ room: this.roomId, session: client.sessionId, name: profile.name }, 'player joined');

    if (this.seats.length === this.maxClients) this.startMatch();
  }

  override onDrop(client: Client) {
    const seat = this.seatOf(client.sessionId);
    if (!seat || this.state.phase === 'finished') return;
    const p = this.state.players.get(client.sessionId);
    if (p) {
      p.connected = false;
      p.reconnectDeadline = Date.now() + this.reconnectSeconds * 1000;
    }
    if (this.state.phase === 'battle' && this.game && this.game.activePlayer === seat.index) this.pauseTurnTimer();
    logger.info({ room: this.roomId, session: client.sessionId }, 'player dropped, awaiting reconnection');
    this.allowReconnection(client, this.reconnectSeconds);
  }

  override onReconnect(client: Client) {
    const p = this.state.players.get(client.sessionId);
    if (p) {
      p.connected = true;
      p.reconnectDeadline = 0;
    }
    if (this.pausedRemainingMs !== null) this.resumeTurnTimer();
    const seat = this.seatOf(client.sessionId);
    if (seat && this.game) {
      client.send(ServerMessage.YourFleet, this.game.players[seat.index].board.ships);
      client.send(ServerMessage.Sync, { view: getPublicView(this.game, seat.index) } satisfies SyncPayload);
    }
    logger.info({ room: this.roomId, session: client.sessionId }, 'player reconnected');
  }

  override onLeave(client: Client) {
    const seat = this.seatOf(client.sessionId);
    this.limiter.forget(client.sessionId);
    if (!seat) return;
    const p = this.state.players.get(client.sessionId);
    const consented = p?.connected !== false;

    if (this.state.phase === 'waiting') {
      this.seats = this.seats.filter((s) => s.sessionId !== client.sessionId);
      this.state.players.delete(client.sessionId);
      if (this.state.hostSessionId === client.sessionId) this.state.hostSessionId = this.seats[0]?.sessionId ?? '';
      return;
    }
    if (p) {
      p.connected = false;
      p.reconnectDeadline = 0;
      p.wantsRematch = false;
    }
    if (this.game && (this.state.phase === 'placement' || this.state.phase === 'battle') && isAlive(this.game, seat.index)) {
      this.dispatch({ type: 'FORFEIT', player: seat.index, reason: consented ? 'forfeit' : 'disconnect' });
    }
    this.broadcastRematchStatus();
  }

  override onDispose() {
    if (this.state.code) unregisterRoomCode(this.state.code);
    logger.info({ room: this.roomId }, 'room disposed');
  }

  // ---- helpers ----

  seatOf(sessionId: string): Seat | undefined {
    return this.seats.find((s) => s.sessionId === sessionId);
  }

  private sessionOf(index: PlayerIndex): string {
    return this.seats.find((s) => s.index === index)?.sessionId ?? '';
  }

  private sendError(client: Client, code: string) {
    client.send(ServerMessage.Error, { code, message: ERROR_MESSAGES[code] ?? code });
  }

  private guarded<S extends z.ZodTypeAny | null>(
    client: Client,
    schema: S,
    raw: unknown,
    handler: (msg: S extends z.ZodTypeAny ? z.infer<S> : unknown, seat: Seat) => void,
  ) {
    if (!this.limiter.take(client.sessionId)) return this.sendError(client, 'RATE_LIMITED');
    const seat = this.seatOf(client.sessionId);
    if (!seat || !this.game) return this.sendError(client, 'WRONG_PHASE');
    let msg: unknown = raw;
    if (schema) {
      const parsed = schema.safeParse(raw);
      if (!parsed.success) return this.sendError(client, 'INVALID_MESSAGE');
      msg = parsed.data;
    }
    handler(msg as never, seat);
  }

  /** Host starts a free-for-all room with whoever has joined so far. */
  private startEarly(client: Client) {
    if (this.state.phase !== 'waiting') return this.sendError(client, 'WRONG_PHASE');
    if (client.sessionId !== this.state.hostSessionId) return this.sendError(client, 'NOT_HOST');
    if (this.teamFormat !== 'ffa' || this.seats.length < MIN_PLAYERS) return this.sendError(client, 'NOT_ENOUGH_PLAYERS');
    this.startMatch();
  }

  private startMatch() {
    this.idleTimer?.clear();
    this.lock();
    this.newGame();
  }

  /** Seats still present for the next game: connected players, in join order. */
  private presentSeats(): Seat[] {
    return this.seats.filter((s) => this.state.players.get(s.sessionId)?.connected !== false);
  }

  /** Players who can't take part (left the room) give up their seat. */
  private dropAbsentSeats() {
    const present = new Set(this.presentSeats().map((s) => s.sessionId));
    for (const s of this.seats) if (!present.has(s.sessionId)) this.state.players.delete(s.sessionId);
    this.seats = this.seats.filter((s) => present.has(s.sessionId));
  }

  private canPlay(count: number): boolean {
    if (count < MIN_PLAYERS) return false;
    return this.teamFormat === 'ffa' || count === playersForFormat(this.teamFormat, count);
  }

  private newGame() {
    const rng = createRng(this.seed ?? randomSeed());
    // Engine seats are 0..n-1; team games shuffle who sits with whom.
    const order = this.seats.slice();
    if (this.teamFormat !== 'ffa') {
      for (let i = order.length - 1; i > 0; i--) {
        const j = rng.int(i + 1);
        [order[i], order[j]] = [order[j], order[i]];
      }
    }
    order.forEach((s, i) => (s.index = i));
    this.seats = order;
    const teams = teamsInOrder(this.teamFormat, order.length);

    this.game = createGame(this.rules, this.seed ?? randomSeed(), teams ? { teams } : { players: order.length });
    this.state.phase = 'placement';
    this.state.winnerSessionId = '';
    this.state.finishReason = '';
    this.state.activeSessionId = '';
    this.state.turnNumber = 0;
    this.state.paused = false;
    for (const s of this.seats) {
      const p = this.state.players.get(s.sessionId);
      if (!p) continue;
      p.seat = s.index;
      p.team = teams ? teams[s.index] : -1;
      p.ready = false;
      p.charge = 0;
      p.shipsSunk.clear();
      p.wantsRematch = false;
      p.eliminated = false;
      p.rank = 0;
    }
    this.sendSyncToAll();
    this.startTimer(this.rules.placementTimeMs ?? ONLINE_PLACEMENT_TIME_MS, () => {
      for (const seat of this.seats) {
        if (this.game && this.game.phase === 'placement' && isAlive(this.game, seat.index) && !this.game.players[seat.index].ready) {
          this.dispatch({ type: 'TIMEOUT', player: seat.index });
          const client = this.clients.getById(seat.sessionId);
          if (client && this.game) client.send(ServerMessage.YourFleet, this.game.players[seat.index].board.ships);
        }
      }
    });
  }

  private startTimer(ms: number, onExpire: () => void) {
    this.turnTimer?.clear();
    this.pausedRemainingMs = null;
    this.state.paused = false;
    const now = Date.now();
    this.state.serverTime = now;
    this.state.turnDeadline = now + ms;
    this.turnTimer = this.clock.setTimeout(onExpire, ms);
  }

  private clearTimer() {
    this.turnTimer?.clear();
    this.turnTimer = null;
    this.state.turnDeadline = 0;
  }

  private startTurnTimer() {
    if (!this.game || this.game.phase !== 'battle') return;
    const active = this.game.activePlayer;
    const activeSession = this.sessionOf(active);
    if (this.state.players.get(activeSession)?.connected === false) {
      this.clearTimer();
      this.pausedRemainingMs = this.rules.turnTimeMs ?? ONLINE_TURN_TIME_MS;
      this.state.paused = true;
      return;
    }
    this.startTimer(this.rules.turnTimeMs ?? ONLINE_TURN_TIME_MS, () => this.onTurnTimeout(active));
  }

  private onTurnTimeout(player: PlayerIndex) {
    if (!this.game || this.game.phase !== 'battle' || this.game.activePlayer !== player) return;
    this.dispatch({ type: 'TIMEOUT', player });
  }

  private pauseTurnTimer() {
    if (!this.turnTimer || this.state.phase !== 'battle') return;
    this.pausedRemainingMs = Math.max(1000, this.state.turnDeadline - Date.now());
    this.turnTimer.clear();
    this.turnTimer = null;
    this.state.paused = true;
  }

  private resumeTurnTimer() {
    if (!this.game || this.game.phase !== 'battle' || this.pausedRemainingMs === null) return;
    const active = this.game.activePlayer;
    this.startTimer(this.pausedRemainingMs, () => this.onTurnTimeout(active));
  }

  /** Applies an action through the engine and fans out results. Returns false on rejection. */
  dispatch(action: Action, client?: Client): boolean {
    if (!this.game) return false;
    const before = this.game;
    const res = applyActionSafe(this.game, action);
    if (res.error) {
      if (client) this.sendError(client, res.error);
      return false;
    }
    this.game = res.state;
    this.syncSchema();

    let sentShot = false;
    let battleStarted = false;
    let over: Extract<GameEvent, { type: 'gameOver' }> | null = null;
    for (const ev of res.events) {
      if (ev.type === 'shot') {
        sentShot = true;
        for (const seat of this.seats) {
          const c = this.clients.getById(seat.sessionId);
          c?.send(ServerMessage.ShotResult, {
            event: redactShotEvent(ev.shot, seat.index, this.game),
            view: getPublicView(this.game, seat.index),
          } satisfies ShotResultPayload);
        }
      } else if (ev.type === 'battleStart') battleStarted = true;
      else if (ev.type === 'gameOver') over = ev;
    }
    if (!sentShot) this.sendSyncToAll();

    const turnMoved = before.phase === 'battle' && (before.activePlayer !== this.game.activePlayer || before.turnNumber !== this.game.turnNumber);
    if (over) this.finish(over.winners, over.reason);
    else if (battleStarted || (this.game.phase === 'battle' && (sentShot || turnMoved))) this.startTurnTimer();
    return true;
  }

  private finish(winners: PlayerIndex[], reason: string) {
    this.clearTimer();
    this.pausedRemainingMs = null;
    this.state.paused = false;
    const winnerSessionIds = winners.map((w) => this.sessionOf(w));
    this.state.winnerSessionId = winnerSessionIds[0] ?? '';
    this.state.finishReason = reason;
    if (!this.game) return;
    const ranks = new Map(standings(this.game).map((s) => [s.player, s.rank]));
    for (const seat of this.seats) {
      const p = this.state.players.get(seat.sessionId);
      if (p) p.rank = ranks.get(seat.index) ?? 0;
    }
    for (const seat of this.seats) {
      const c = this.clients.getById(seat.sessionId);
      if (!c) continue;
      const firstEnemy = this.game.players.findIndex((_, i) => i !== seat.index && !areAllies(this.game!, seat.index, i));
      c.send(ServerMessage.GameOver, {
        winnerSessionId: this.state.winnerSessionId,
        winnerSessionIds,
        youWon: winners.includes(seat.index),
        rank: ranks.get(seat.index) ?? 0,
        reason: reason as GameOverPayload['reason'],
        revealFleet: this.game.players[firstEnemy >= 0 ? firstEnemy : 0].board.ships,
        view: getPublicView(this.game, seat.index),
      } satisfies GameOverPayload);
    }
    logger.info({ room: this.roomId, winners: winnerSessionIds, reason }, 'game over');
  }

  private syncSchema() {
    if (!this.game) return;
    const g = this.game;
    this.state.phase = g.phase;
    this.state.turnNumber = g.turnNumber;
    this.state.activeSessionId = g.phase === 'battle' ? this.sessionOf(g.activePlayer) : '';
    for (const seat of this.seats) {
      const p = this.state.players.get(seat.sessionId);
      if (!p) continue;
      const ps = g.players[seat.index];
      p.ready = ps.ready;
      p.charge = ps.charge;
      p.eliminated = !!ps.out;
      const lost = ps.board.ships.filter((s) => s.hits >= s.cells.length).map((s) => s.defId);
      if (lost.length !== p.shipsSunk.length) {
        p.shipsSunk.clear();
        lost.forEach((id) => p.shipsSunk.push(id));
      }
    }
  }

  private sendSyncToAll() {
    if (!this.game) return;
    for (const seat of this.seats) {
      this.clients.getById(seat.sessionId)?.send(ServerMessage.Sync, { view: getPublicView(this.game, seat.index) } satisfies SyncPayload);
    }
  }

  private voteRematch(client: Client) {
    if (this.state.phase !== 'finished') return this.sendError(client, 'WRONG_PHASE');
    const p = this.state.players.get(client.sessionId);
    if (p) p.wantsRematch = true;
    this.broadcastRematchStatus();
    const present = this.presentSeats();
    const all = present.every((s) => this.state.players.get(s.sessionId)?.wantsRematch);
    if (all && this.canPlay(present.length)) {
      this.dropAbsentSeats();
      this.newGame();
    }
  }

  private broadcastRematchStatus() {
    const requested: string[] = [];
    this.state.players.forEach((p, id) => {
      if (p.wantsRematch) requested.push(id);
    });
    this.broadcast(ServerMessage.Rematch, { requested });
  }
}

function applyActionSafe(state: GameState, action: Action) {
  try {
    return applyAction(state, action);
  } catch (err) {
    logger.error({ err, action: action.type }, 'engine error');
    return { state, events: [], error: 'WRONG_PHASE' as const };
  }
}

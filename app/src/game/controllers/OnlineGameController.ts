import { Client, CloseCode, type Room } from '@colyseus/sdk';
import { AppState, type NativeEventSubscription } from 'react-native';
import {
  clampBoardSize,
  type Coord,
  type GameMode,
  type MatchSettings,
  matchRules,
  OBSTACLE_LEVELS,
  parseGameMode,
  parseTeamFormat,
  type PlacedShip,
  type PublicView,
  type RuleSet,
  STANDARD_MATCH_SETTINGS,
  type TeamFormat,
} from '@shared/engine';
import {
  ClientMessage,
  type EmoteBroadcast,
  type EmoteId,
  ERROR_MESSAGES,
  type ErrorPayload,
  type GameOverPayload,
  PROTOCOL_VERSION,
  type ProfilePayload,
  type RematchStatusPayload,
  ROOM_NAME,
  roomCodeSchema,
  ServerMessage,
  type ShotResultPayload,
  type SyncPayload,
} from '@shared/protocol';
import { getHttpUrl, getServerUrl } from '@/net/serverUrl';
import { removeKey, writeJson } from '@/platform/storage';
import { type ControllerMeta, Emitter, type GameController, type MetaPhase, type SeatInfo } from './types';

/** Room size and team split chosen by the host. */
export interface RoomSize {
  maxPlayers: number;
  teamFormat: TeamFormat;
}

export type OnlineJoin =
  | { kind: 'quick'; mode: GameMode }
  | { kind: 'create'; mode: GameMode; settings: MatchSettings; size: RoomSize }
  | { kind: 'code'; code: string };

export class OnlineError extends Error {
  constructor(
    readonly code: string,
    message?: string,
  ) {
    super(message ?? ERROR_MESSAGES[code] ?? code);
  }
}

/** Shape of the synced Colyseus schema as seen by the client (decoded via reflection). */
interface SyncedPlayer {
  sessionId: string;
  seat: number;
  name: string;
  avatarId: string;
  wins: number;
  losses: number;
  connected: boolean;
  reconnectDeadline: number;
  wantsRematch: boolean;
  team?: number;
  eliminated?: boolean;
  rank?: number;
}
interface SyncedState {
  phase: string;
  players: { forEach(cb: (p: SyncedPlayer, id: string) => void): void };
  turnDeadline: number;
  serverTime: number;
  paused: boolean;
  mode: string;
  boardSize: number;
  obstacles: string;
  code: string;
  maxPlayers?: number;
  teamFormat?: string;
  hostSessionId?: string;
}

/** Joins resolve on the handshake; the room's mode and table only arrive with the first full state. */
function firstState(room: Room): Promise<void> {
  if ((room.state as SyncedState | undefined)?.phase) return Promise.resolve();
  return new Promise((resolve) => room.onStateChange.once(() => resolve()));
}

function settingsFromState(state: SyncedState): MatchSettings {
  const obstacles = OBSTACLE_LEVELS.find((o) => o === state.obstacles) ?? STANDARD_MATCH_SETTINGS.obstacles;
  return { boardSize: clampBoardSize(state.boardSize || STANDARD_MATCH_SETTINGS.boardSize), obstacles };
}

const RECONNECT_KEY = 'reconnect.v1';
const JOIN_TIMEOUT_MS = 10_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new OnlineError('TIMEOUT', 'Server did not respond.')), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

function mapJoinError(err: unknown): OnlineError {
  if (err instanceof OnlineError) return err;
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes('PROTOCOL_MISMATCH')) return new OnlineError('PROTOCOL_MISMATCH');
  if (/locked|full|not found|no rooms/i.test(message)) return new OnlineError('ROOM_NOT_FOUND');
  return new OnlineError('OFFLINE', 'Could not reach the battle server.');
}

export async function checkServer(timeoutMs = 3000): Promise<boolean> {
  try {
    const res = await withTimeout(fetch(`${getHttpUrl()}/health`), timeoutMs);
    if (!res.ok) return false;
    const body = (await res.json()) as { ok?: boolean; protocolVersion?: number };
    return body.ok === true;
  } catch {
    return false;
  }
}

export class OnlineGameController implements GameController {
  readonly kind = 'online' as const;
  readonly mode: GameMode;
  readonly settings: MatchSettings;

  private emitter = new Emitter();
  private view: PublicView | null = null;
  private clockOffset = 0;
  private lastServerTime = 0;
  private connection: ControllerMeta['connection'] = 'connected';
  private leaving = false;
  private disposed = false;
  private closedAt: number | null = null;
  private appStateSub: NativeEventSubscription | null = null;
  private unbinders: (() => void)[] = [];
  private rulesCache: RuleSet;

  private constructor(
    private client: Client,
    private room: Room,
    private profile: ProfilePayload,
  ) {
    const state = room.state as SyncedState;
    this.mode = parseGameMode(state.mode);
    this.settings = settingsFromState(state);
    this.rulesCache = matchRules(this.mode, this.settings);
    this.bind(room);
    this.appStateSub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void this.tryManualReconnect();
    });
  }

  static async connect(join: OnlineJoin, profile: ProfilePayload): Promise<OnlineGameController> {
    const client = new Client(getServerUrl());
    const base = { protocolVersion: PROTOCOL_VERSION, profile };
    try {
      let room: Room;
      if (join.kind === 'quick') {
        room = await withTimeout(client.joinOrCreate(ROOM_NAME, { ...base, mode: join.mode }), JOIN_TIMEOUT_MS);
      } else if (join.kind === 'create') {
        room = await withTimeout(
          client.create(ROOM_NAME, { ...base, mode: join.mode, private: true, ...join.settings, ...join.size }),
          JOIN_TIMEOUT_MS,
        );
      } else {
        const parsed = roomCodeSchema.safeParse(join.code);
        if (!parsed.success) throw new OnlineError('ROOM_NOT_FOUND', 'That code looks wrong.');
        const res = await withTimeout(fetch(`${getHttpUrl()}/rooms/code/${parsed.data}`), JOIN_TIMEOUT_MS);
        if (res.status === 404) throw new OnlineError('ROOM_NOT_FOUND');
        if (!res.ok) throw new OnlineError('OFFLINE', 'Could not reach the battle server.');
        const { roomId } = (await res.json()) as { roomId: string };
        room = await withTimeout(client.joinById(roomId, base), JOIN_TIMEOUT_MS);
      }
      room.reconnection.maxRetries = 15;
      room.reconnection.maxDelay = 3000;
      await withTimeout(firstState(room), JOIN_TIMEOUT_MS);
      const controller = new OnlineGameController(client, room, profile);
      void writeJson(RECONNECT_KEY, { token: room.reconnectionToken, at: Date.now() });
      return controller;
    } catch (err) {
      throw mapJoinError(err);
    }
  }

  get rules(): RuleSet {
    return this.view?.rules ?? this.rulesCache;
  }

  get sessionId() {
    return this.room.sessionId;
  }

  private bind(room: Room) {
    this.unbinders.forEach((u) => u());
    this.unbinders = [
      room.onMessage<SyncPayload>(ServerMessage.Sync, ({ view }) => {
        this.view = view;
        this.emitter.emit({ type: 'view', view });
      }),
      room.onMessage<ShotResultPayload>(ServerMessage.ShotResult, ({ event, view }) => {
        this.view = view;
        this.emitter.emit({ type: 'shot', event, view });
      }),
      room.onMessage<GameOverPayload>(ServerMessage.GameOver, (p) => {
        this.view = p.view;
        this.emitter.emit({ type: 'gameOver', youWon: p.youWon, reason: p.reason, view: p.view, revealFleet: p.revealFleet, rank: p.rank });
      }),
      room.onMessage<ErrorPayload>(ServerMessage.Error, (p) => this.emitter.emit({ type: 'error', code: p.code, message: p.message })),
      room.onMessage<EmoteBroadcast>(ServerMessage.Emote, (p) =>
        this.emitter.emit({ type: 'emote', fromMe: p.sessionId === room.sessionId, id: p.id }),
      ),
      room.onMessage<RematchStatusPayload>(ServerMessage.Rematch, () => this.emitMeta()),
      room.onMessage(ServerMessage.YourFleet, () => undefined),
    ];
    room.onStateChange((state: SyncedState) => {
      if (state.serverTime && state.serverTime !== this.lastServerTime) {
        this.lastServerTime = state.serverTime;
        this.clockOffset = state.serverTime - Date.now();
      }
      this.emitMeta();
    });
    room.onDrop(() => {
      this.connection = 'reconnecting';
      this.emitMeta();
    });
    room.onReconnect(() => {
      this.connection = 'connected';
      this.closedAt = null;
      this.emitMeta();
    });
    room.onLeave((code) => {
      if (this.leaving || this.disposed) return;
      if (code === CloseCode.CONSENTED || code === CloseCode.NORMAL_CLOSURE || this.view?.phase === 'finished') {
        this.connection = 'disconnected';
        this.emitMeta();
        this.emitter.emit({ type: 'closed', reason: 'left' });
        void removeKey(RECONNECT_KEY);
        return;
      }
      this.connection = 'disconnected';
      this.closedAt = Date.now();
      this.emitMeta();
      void this.tryManualReconnect();
    });
  }

  /** Last resort when the SDK's automatic reconnection gave up (e.g. app was backgrounded). */
  private async tryManualReconnect() {
    if (this.disposed || this.leaving || this.connection !== 'disconnected' || this.closedAt === null) return;
    if (Date.now() - this.closedAt > 30_000) {
      this.emitter.emit({ type: 'closed', reason: 'disconnect' });
      return;
    }
    try {
      this.connection = 'reconnecting';
      this.emitMeta();
      const room = await withTimeout(this.client.reconnect(this.room.reconnectionToken), JOIN_TIMEOUT_MS);
      this.room = room;
      this.bind(room);
      this.connection = 'connected';
      this.closedAt = null;
      void writeJson(RECONNECT_KEY, { token: room.reconnectionToken, at: Date.now() });
      this.emitMeta();
    } catch {
      this.connection = 'disconnected';
      this.emitMeta();
      this.emitter.emit({ type: 'closed', reason: 'disconnect' });
    }
  }

  private seats(): SeatInfo[] {
    const state = this.room.state as SyncedState | undefined;
    const out: SeatInfo[] = [];
    state?.players?.forEach((p, id) => {
      out.push({
        sessionId: id,
        seat: p.seat,
        name: p.name,
        avatarId: p.avatarId,
        wins: p.wins,
        losses: p.losses,
        connected: p.connected,
        reconnectDeadline: !p.connected && p.reconnectDeadline ? this.toLocal(p.reconnectDeadline) : null,
        wantsRematch: p.wantsRematch,
        team: p.team ?? -1,
        eliminated: p.eliminated ?? false,
        rank: p.rank ?? 0,
        isHost: !!state.hostSessionId && id === state.hostSessionId,
        isMe: id === this.room.sessionId,
      });
    });
    return out.sort((a, b) => a.seat - b.seat);
  }

  private toLocal(serverMs: number) {
    return serverMs ? serverMs - this.clockOffset : null;
  }

  getView() {
    return this.view;
  }

  getMeta(): ControllerMeta {
    const state = this.room.state as SyncedState | undefined;
    const seats = this.seats();
    const me = seats.find((s) => s.isMe) ?? null;
    const others = seats.filter((s) => !s.isMe);
    const opponent = others[0] ?? null;
    const phase = (state?.phase ?? 'waiting') as MetaPhase;
    return {
      phase,
      me: me ?? { name: this.profile.name, avatarId: this.profile.avatarId, wins: this.profile.wins, losses: this.profile.losses, connected: true },
      opponent,
      deadline: state && !state.paused ? this.toLocal(state.turnDeadline) : null,
      paused: state?.paused ?? false,
      connection: this.connection,
      opponentReconnectDeadline: opponent?.reconnectDeadline ?? null,
      code: state?.code || undefined,
      rematch: { me: me?.wantsRematch ?? false, opponent: others.some((s) => s.wantsRematch) },
      seats,
      maxPlayers: state?.maxPlayers || 2,
      teamFormat: parseTeamFormat(state?.teamFormat),
      isHost: me?.isHost ?? false,
    };
  }

  subscribe(listener: Parameters<GameController['subscribe']>[0]) {
    return this.emitter.subscribe(listener);
  }

  placeFleet(ships: PlacedShip[], mines?: Coord[]) {
    this.room.send(ClientMessage.PlaceFleet, {
      ships: ships.map((s) => ({ defId: s.defId, x: s.origin.x, y: s.origin.y, rotation: s.rotation })),
      mines: mines?.map((m) => ({ x: m.x, y: m.y })),
    });
  }

  ready() {
    this.room.send(ClientMessage.Ready, {});
  }

  fire(target: Coord, targetPlayer?: number) {
    this.room.send(ClientMessage.Fire, { x: target.x, y: target.y, targetPlayer });
  }

  useWeapon(weaponId: string, target: Coord, targetPlayer?: number) {
    this.room.send(ClientMessage.UseWeapon, { weaponId, x: target.x, y: target.y, targetPlayer });
  }

  startEarly() {
    this.room.send(ClientMessage.Start, {});
  }

  forfeit() {
    this.room.send(ClientMessage.Forfeit, {});
  }

  rematch() {
    this.room.send(ClientMessage.Rematch, {});
  }

  emote(id: EmoteId) {
    this.room.send(ClientMessage.Emote, { id });
  }

  pause() {
    // Online timers are server-authoritative.
  }

  resume() {}

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.leaving = true;
    this.appStateSub?.remove();
    this.unbinders.forEach((u) => u());
    this.emitter.clear();
    void removeKey(RECONNECT_KEY);
    this.room.leave(true).catch(() => undefined);
  }

  private emitMeta() {
    if (this.disposed) return;
    this.emitter.emit({ type: 'meta', meta: this.getMeta() });
  }
}

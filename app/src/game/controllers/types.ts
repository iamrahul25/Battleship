import type { Coord, Difficulty, FinishReason, GameMode, PlacedShip, PublicView, RuleSet, ShotEvent, TeamFormat } from '@shared/engine';
import type { EmoteId } from '@shared/protocol';

export interface PlayerCardInfo {
  name: string;
  avatarId: string;
  wins: number;
  losses: number;
  connected: boolean;
  isBot?: boolean;
}

/** A player in the room, for lobbies and 3+ player battles. */
export interface SeatInfo extends PlayerCardInfo {
  sessionId: string;
  /** Engine seat; matches `PublicView.players[i].player` once the game has started. */
  seat: number;
  /** -1 when not in a team game (or not started). */
  team: number;
  eliminated: boolean;
  /** Final place (0 until the game is finished). */
  rank: number;
  isHost: boolean;
  isMe: boolean;
  wantsRematch: boolean;
  /** Local-clock epoch ms by which a disconnected player must return. */
  reconnectDeadline: number | null;
}

export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';
export type MetaPhase = 'waiting' | 'placement' | 'battle' | 'finished';

export interface ControllerMeta {
  phase: MetaPhase;
  me: PlayerCardInfo;
  opponent: PlayerCardInfo | null;
  /** Local-clock epoch ms when the current turn/placement timer expires; null when untimed. */
  deadline: number | null;
  /** Turn timer frozen (opponent disconnected or game paused). */
  paused: boolean;
  connection: ConnectionStatus;
  /** Local-clock epoch ms by which a disconnected opponent must return. */
  opponentReconnectDeadline: number | null;
  /** Private room code. */
  code?: string;
  rematch: { me: boolean; opponent: boolean };
  /** Everyone in the room (including me), sorted by seat. */
  seats: SeatInfo[];
  maxPlayers: number;
  teamFormat: TeamFormat;
  isHost: boolean;
}

export type ControllerEvent =
  | { type: 'view'; view: PublicView }
  | { type: 'shot'; event: ShotEvent; view: PublicView }
  | { type: 'gameOver'; youWon: boolean; reason: FinishReason; view: PublicView; revealFleet: PlacedShip[]; rank?: number }
  | { type: 'error'; code: string; message: string }
  | { type: 'meta'; meta: ControllerMeta }
  | { type: 'emote'; fromMe: boolean; id: EmoteId }
  /** The online room is gone for good (left, kicked, or reconnection failed). */
  | { type: 'closed'; reason: string };

export type ControllerListener = (e: ControllerEvent) => void;

export interface GameController {
  readonly kind: 'bot' | 'online';
  readonly mode: GameMode;
  readonly rules: RuleSet;
  readonly difficulty?: Difficulty;
  getView(): PublicView | null;
  getMeta(): ControllerMeta;
  /** `mines` moves the player's own mines; omitted keeps the dealt positions. */
  placeFleet(ships: PlacedShip[], mines?: Coord[]): void;
  ready(): void;
  /** `targetPlayer` is the seat to fire at (needed with 2+ enemies). */
  fire(target: Coord, targetPlayer?: number): void;
  useWeapon(id: string, target: Coord, targetPlayer?: number): void;
  forfeit(): void;
  /** Host starts a free-for-all room before it is full. */
  startEarly?(): void;
  rematch(): void;
  emote(id: EmoteId): void;
  /** Freeze timers (offline pause menu / app backgrounded). */
  pause(): void;
  resume(): void;
  subscribe(listener: ControllerListener): () => void;
  dispose(): void;
}

export class Emitter {
  private listeners = new Set<ControllerListener>();
  subscribe(listener: ControllerListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  emit(e: ControllerEvent) {
    this.listeners.forEach((l) => l(e));
  }
  clear() {
    this.listeners.clear();
  }
}

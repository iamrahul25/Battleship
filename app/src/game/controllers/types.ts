import type { Coord, Difficulty, FinishReason, GameMode, Orientation, PlacedShip, PublicView, RuleSet, ShotEvent } from '@shared/engine';
import type { EmoteId } from '@shared/protocol';

export interface PlayerCardInfo {
  name: string;
  avatarId: string;
  wins: number;
  losses: number;
  connected: boolean;
  isBot?: boolean;
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
}

export type ControllerEvent =
  | { type: 'view'; view: PublicView }
  | { type: 'shot'; event: ShotEvent; view: PublicView }
  | { type: 'gameOver'; youWon: boolean; reason: FinishReason; view: PublicView; revealFleet: PlacedShip[] }
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
  placeFleet(ships: PlacedShip[]): void;
  ready(): void;
  fire(target: Coord): void;
  useWeapon(id: string, target: Coord, orientation?: Orientation): void;
  forfeit(): void;
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

export type Coord = { x: number; y: number };
export type Rotation = 0 | 90 | 180 | 270;
/** Seat number, `0..players.length - 1`. */
export type PlayerIndex = number;

/** Data-driven ship shape, so future polyomino ships need no engine changes. */
export interface ShipDef {
  id: string;
  name: string;
  /** Shape relative to origin (straight line for the classic fleet). */
  cells: Coord[];
  count: number;
}

export interface PlacedShip {
  /** `${defId}#${index}`, e.g. `carrier#0`. */
  uid: string;
  defId: string;
  origin: Coord;
  rotation: Rotation;
  /** Absolute cells on the board. */
  cells: Coord[];
  hits: number;
}

export type CellState = 'unknown' | 'miss' | 'hit' | 'sunk' | 'knownEmpty';

/**
 * rock/island: visible, can't be shot, stop torpedoes. reef: visible, shooting it is a miss.
 * mine: hidden from the enemy; shooting it makes the shooter skip their next turn.
 */
export type ObstacleKind = 'rock' | 'island' | 'reef' | 'mine';
export type ObstacleLevel = 'none' | 'few' | 'many';

export interface Board {
  width: number;
  height: number;
  ships: PlacedShip[];
  /** Shots received on this board, keyed by `"x,y"`. Missing key means `unknown`. */
  shots: Record<string, CellState>;
  /** Obstacles on this board, keyed by `"x,y"`. */
  obstacles?: Record<string, ObstacleKind>;
}

export interface RuleSet {
  grid: { width: number; height: number };
  fleet: ShipDef[];
  allowTouching: boolean;
  bonusShotOnHit: boolean;
  powerUpsEnabled: boolean;
  turnTimeMs: number | null;
  placementTimeMs: number | null;
  /** Obstacle density; missing means none. */
  obstacles?: ObstacleLevel;
}

export type Phase = 'placement' | 'battle' | 'finished';
export type FinishReason = 'sunk' | 'forfeit' | 'timeout' | 'disconnect';

export interface PlayerState {
  /** Own fleet plus incoming shots from the opponent. */
  board: Board;
  ready: boolean;
  charge: number;
  weaponUses: Record<string, number>;
  missStreak: number;
  consecutiveTimeouts: number;
  shotsFired: number;
  hits: number;
  shipsSunk: number;
  powerUpsUsed: number;
  /** Set by hitting a mine: the next turn that would pass to this player is skipped. */
  skipNextTurn?: boolean;
  /** How this player was knocked out (fleet sunk, forfeit, …). Missing while still in the game. */
  out?: FinishReason;
}

export interface GameState {
  rules: RuleSet;
  phase: Phase;
  players: PlayerState[];
  activePlayer: PlayerIndex;
  /** Seat rotation for turns. Missing (older saves) means seat order. */
  turnOrder?: PlayerIndex[];
  /** Team id per seat. Missing means free-for-all (every seat is its own team). */
  teams?: number[];
  /** Seats in the order they were knocked out. */
  eliminated?: PlayerIndex[];
  turnNumber: number;
  /** First winner, kept for 1v1 callers; `winners` has the whole winning team. */
  winner: PlayerIndex | null;
  winners?: PlayerIndex[];
  finishReason: FinishReason | null;
  log: ShotEvent[];
  /** Seeded RNG state so the reducer stays pure and replayable. */
  rngState: number;
}

export type ShotResultKind = 'miss' | 'hit' | 'sunk';

export interface ShotResult {
  coord: Coord;
  result: ShotResultKind;
  /** Set when a miss landed on a reef or a hidden mine. */
  obstacle?: 'reef' | 'mine';
  shipUid?: string;
  /** Full ship revealed when sunk. */
  ship?: PlacedShip;
}

export interface SonarResult {
  area: Coord[];
  /** Total ship cells (hit or not) inside the scanned area. */
  shipCellsFound: number;
}

export interface ShotEvent {
  by: PlayerIndex;
  /** Seat whose board was fired at. Missing in logs from before multiplayer (= the other seat). */
  against?: PlayerIndex;
  weaponId: string;
  target: Coord;
  results: ShotResult[];
  sonar?: SonarResult;
  /** Cells auto-marked as empty: around ships sunk by this event, and water a torpedo ran through. */
  knownEmpty?: Coord[];
  /** Torpedo track from the drop cell to where it stopped. */
  path?: Coord[];
  turnPassed: boolean;
  /** The shooter hit a mine and will skip their next turn. */
  mineTriggered?: boolean;
  /** This player's turn was skipped (mine penalty), so the shooter goes again. */
  turnSkipped?: PlayerIndex;
  /** Set when the server/engine fired on the player's behalf after a timeout. */
  auto?: boolean;
  turnNumber: number;
}

export type Action =
  /** `mines` repositions the player's own mines; omitted keeps them where they are. */
  | { type: 'PLACE_FLEET'; player: PlayerIndex; ships: PlacedShip[]; mines?: Coord[] }
  | { type: 'READY'; player: PlayerIndex }
  /** `targetPlayer` picks whose board to fire at; omitted means the first enemy still afloat. */
  | { type: 'FIRE'; player: PlayerIndex; target: Coord; targetPlayer?: PlayerIndex }
  | { type: 'USE_WEAPON'; player: PlayerIndex; weaponId: string; target: Coord; targetPlayer?: PlayerIndex }
  | { type: 'TIMEOUT'; player: PlayerIndex }
  | { type: 'FORFEIT'; player: PlayerIndex; reason?: 'forfeit' | 'disconnect' };

export type GameErrorCode =
  | 'WRONG_PHASE'
  | 'NOT_YOUR_TURN'
  | 'ALREADY_FIRED'
  | 'OUT_OF_BOUNDS'
  | 'INVALID_PLACEMENT'
  | 'FLEET_INCOMPLETE'
  | 'ALREADY_READY'
  | 'WEAPON_NOT_READY'
  | 'WEAPON_UNKNOWN'
  | 'POWERUPS_DISABLED'
  | 'BLOCKED'
  | 'INVALID_TARGET';

export type GameEvent =
  | { type: 'fleetPlaced'; player: PlayerIndex }
  | { type: 'ready'; player: PlayerIndex }
  | { type: 'battleStart'; firstPlayer: PlayerIndex }
  | { type: 'shot'; shot: ShotEvent }
  | { type: 'eliminated'; player: PlayerIndex; reason: FinishReason }
  | { type: 'gameOver'; winner: PlayerIndex; winners: PlayerIndex[]; reason: FinishReason };

export interface ActionResult {
  state: GameState;
  events: GameEvent[];
  error?: GameErrorCode;
}

/** Opponent board as seen by the attacker: only shots and sunk ships. */
export interface TargetView {
  width: number;
  height: number;
  shots: Record<string, CellState>;
  /** Only sunk ships (or all ships once the game is finished). */
  ships: PlacedShip[];
  /** Visible obstacles: rocks, islands, reefs, and mines that have been triggered (all once finished). */
  obstacles?: Record<string, ObstacleKind>;
}

export interface PlayerPublicInfo {
  ready: boolean;
  charge: number;
  weaponUses: Record<string, number>;
  shotsFired: number;
  hits: number;
  /** Enemy ships this player sank. */
  shipsSunk: number;
  shipsRemaining: number;
  /** defIds of ships this player has lost. */
  shipsLost: string[];
  consecutiveTimeouts: number;
  powerUpsUsed: number;
}

/** One seat as seen by the viewer. */
export interface SeatView {
  player: PlayerIndex;
  team: number;
  /** How the seat was knocked out; null while still in the game. */
  out: FinishReason | null;
  info: PlayerPublicInfo;
  /** Own and allied boards are complete; enemy boards show shots and sunk ships (everything once out or finished). */
  board: TargetView;
}

export interface Standing {
  player: PlayerIndex;
  /** 1 = winner. Teammates share a rank. */
  rank: number;
  out: FinishReason | null;
}

export interface PublicView {
  rules: RuleSet;
  phase: Phase;
  viewer: PlayerIndex;
  activePlayer: PlayerIndex;
  turnNumber: number;
  winner: PlayerIndex | null;
  finishReason: FinishReason | null;
  myBoard: Board;
  /** First enemy still afloat (the only one in 1v1). */
  enemyBoard: TargetView;
  me: PlayerPublicInfo;
  enemy: PlayerPublicInfo;
  log: ShotEvent[];
  /** Every seat, indexed by seat number. */
  players: SeatView[];
  turnOrder: PlayerIndex[];
  /** True when seats are split into teams (2v2, 3v3, 2v2v2). */
  teamGame: boolean;
  winners: PlayerIndex[];
  /** Final ranking, set once the game is finished. */
  standings: Standing[] | null;
}

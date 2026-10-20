export type Coord = { x: number; y: number };
export type Orientation = 'H' | 'V';
export type Rotation = 0 | 90 | 180 | 270;
export type PlayerIndex = 0 | 1;

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
}

export interface GameState {
  rules: RuleSet;
  phase: Phase;
  players: [PlayerState, PlayerState];
  activePlayer: PlayerIndex;
  turnNumber: number;
  winner: PlayerIndex | null;
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
  weaponId: string;
  target: Coord;
  results: ShotResult[];
  sonar?: SonarResult;
  /** Cells auto-marked as empty: around ships sunk by this event, and water a torpedo ran through. */
  knownEmpty?: Coord[];
  /** Torpedo track from the launch cell to where it stopped. */
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
  | { type: 'PLACE_FLEET'; player: PlayerIndex; ships: PlacedShip[] }
  | { type: 'READY'; player: PlayerIndex }
  | { type: 'FIRE'; player: PlayerIndex; target: Coord }
  | { type: 'USE_WEAPON'; player: PlayerIndex; weaponId: string; target: Coord; orientation?: Orientation }
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
  | 'BLOCKED';

export type GameEvent =
  | { type: 'fleetPlaced'; player: PlayerIndex }
  | { type: 'ready'; player: PlayerIndex }
  | { type: 'battleStart'; firstPlayer: PlayerIndex }
  | { type: 'shot'; shot: ShotEvent }
  | { type: 'gameOver'; winner: PlayerIndex; reason: FinishReason };

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
  shipsRemaining: number;
  /** defIds of ships this player has lost. */
  shipsLost: string[];
  consecutiveTimeouts: number;
  powerUpsUsed: number;
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
  enemyBoard: TargetView;
  me: PlayerPublicInfo;
  enemy: PlayerPublicInfo;
  log: ShotEvent[];
}

import { cellAt, inBounds, isSolidObstacle, obstacleAt } from './board';
import type { CellState, Coord, ObstacleKind, PlayerState, RuleSet } from './types';

/**
 * area: hits every cell of `pattern` around the target. reveal: scans the pattern without firing.
 * random: fires `shots` times at random unrevealed cells (target ignored).
 * torpedo: dropped on `target`, runs right until it strikes something or reaches the edge.
 */
export type WeaponKind = 'area' | 'reveal' | 'random' | 'torpedo';

export interface WeaponDef {
  id: string;
  name: string;
  /** Short label for compact buttons. */
  short: string;
  description: string;
  cost: number;
  maxUses: number | null;
  /** Offsets from the target. */
  pattern: Coord[];
  kind: WeaponKind;
  /** Number of shots for `random` weapons. */
  shots?: number;
}

export const WEAPONS: Record<string, WeaponDef> = {
  standard: {
    id: 'standard',
    name: 'Cannon',
    short: 'CANNON',
    description: 'Single shot.',
    cost: 0,
    maxUses: null,
    pattern: [{ x: 0, y: 0 }],
    kind: 'area',
  },
  barrage: {
    id: 'barrage',
    name: 'Barrage',
    short: 'BARRAGE',
    description: '4 shots land on random unrevealed enemy cells.',
    cost: 70,
    maxUses: 2,
    pattern: [],
    kind: 'random',
    shots: 4,
  },
  sonar: {
    id: 'sonar',
    name: 'Sonar Scan',
    short: 'SONAR',
    description: 'Reveals how many ship cells hide in a 3×3 area.',
    cost: 80,
    maxUses: null,
    pattern: [-1, 0, 1].flatMap((y) => [-1, 0, 1].map((x) => ({ x, y }))),
    kind: 'reveal',
  },
  torpedo: {
    id: 'torpedo',
    name: 'Torpedo',
    short: 'TORPEDO',
    description: 'Drop it on any cell: it runs right until it hits a ship, a rock or island, or the edge.',
    cost: 50,
    maxUses: 2,
    pattern: [],
    kind: 'torpedo',
  },
  airstrike: {
    id: 'airstrike',
    name: 'Airstrike',
    short: 'AIRSTRIKE',
    description: 'Drop it on any cell: it strikes that cell and the next 3 cells forward (up).',
    cost: 60,
    maxUses: 2,
    pattern: [0, 1, 2, 3].map((d) => ({ x: 0, y: -d })),
    kind: 'area',
  },
  artillery: {
    id: 'artillery',
    name: 'Heavy Artillery',
    short: 'ARTILLERY',
    description: 'Strikes a plus-shaped 5-cell pattern.',
    cost: 100,
    maxUses: 2,
    pattern: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ],
    kind: 'area',
  },
};

/** Power-ups in button order (cheapest first). */
export const POWER_UP_IDS = ['torpedo', 'airstrike', 'barrage', 'sonar', 'artillery'] as const;

export function getWeapon(id: string): WeaponDef | undefined {
  return WEAPONS[id];
}

/** Cells covered by a weapon aimed at `target`, clipped to the board. */
export function patternCells(weapon: WeaponDef, target: Coord, dims: { width: number; height: number }): Coord[] {
  return weapon.pattern.map((o) => ({ x: target.x + o.x, y: target.y + o.y })).filter((c) => inBounds(dims, c));
}

type LaneBoard = { width: number; height: number; shots: Record<string, CellState>; obstacles?: Record<string, ObstacleKind> };

/** Cells a torpedo dropped on `drop` travels through going right, stopping before the first rock or island. */
export function torpedoLane(board: LaneBoard, drop: Coord): Coord[] {
  const out: Coord[] = [];
  for (let c = drop; inBounds(board, c); c = { x: c.x + 1, y: c.y }) {
    if (isSolidObstacle(obstacleAt(board, c))) break;
    out.push(c);
  }
  return out;
}

/** A lane is worth firing when it holds at least one unrevealed cell that isn't a visible reef. */
export function torpedoHasTarget(board: LaneBoard, lane: Coord[]): boolean {
  return lane.some((c) => cellAt(board, c) === 'unknown' && obstacleAt(board, c) !== 'reef');
}

/** Boards at least this size give every limited power-up `LARGE_BOARD_WEAPON_USES` uses. */
export const LARGE_BOARD_SIZE = 13;
export const LARGE_BOARD_WEAPON_USES = 3;

/** Uses per game of `weapon` on this board, or null when unlimited. */
export function weaponMaxUses(weapon: WeaponDef, rules: Pick<RuleSet, 'grid'>): number | null {
  if (weapon.maxUses === null) return null;
  const large = Math.max(rules.grid.width, rules.grid.height) >= LARGE_BOARD_SIZE;
  return large ? Math.max(weapon.maxUses, LARGE_BOARD_WEAPON_USES) : weapon.maxUses;
}

export function weaponUsesLeft(player: Pick<PlayerState, 'weaponUses'>, weapon: WeaponDef, rules: Pick<RuleSet, 'grid'>): number {
  const max = weaponMaxUses(weapon, rules);
  if (max === null) return Infinity;
  return Math.max(0, max - (player.weaponUses[weapon.id] ?? 0));
}

export function canUseWeapon(
  player: Pick<PlayerState, 'charge' | 'weaponUses'>,
  weapon: WeaponDef,
  rules: Pick<RuleSet, 'powerUpsEnabled' | 'grid'>,
): boolean {
  if (weapon.id === 'standard') return true;
  if (!rules.powerUpsEnabled) return false;
  return player.charge >= weapon.cost && weaponUsesLeft(player, weapon, rules) > 0;
}

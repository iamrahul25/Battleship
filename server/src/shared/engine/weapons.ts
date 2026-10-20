import { cellAt, inBounds, isSolidObstacle, obstacleAt } from './board';
import type { CellState, Coord, ObstacleKind, Orientation, PlayerState, RuleSet } from './types';

/**
 * area: hits every cell of `pattern` around the target. reveal: scans the pattern without firing.
 * random: fires `shots` times at random unrevealed cells (target ignored).
 * torpedo: runs along a row/column from the edge cell `target` until it strikes something.
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
  /** Offsets from the target (horizontal orientation). */
  pattern: Coord[];
  kind: WeaponKind;
  /** The player picks horizontal or vertical. */
  rotatable: boolean;
  /** Shift the pattern so it lies fully on the board instead of clipping it. */
  keepInside?: boolean;
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
    rotatable: false,
  },
  barrage: {
    id: 'barrage',
    name: 'Barrage',
    short: 'BARRAGE',
    description: '4 shots land on random unrevealed enemy cells.',
    cost: 50,
    maxUses: 2,
    pattern: [],
    kind: 'random',
    rotatable: false,
    shots: 4,
  },
  sonar: {
    id: 'sonar',
    name: 'Sonar Scan',
    short: 'SONAR',
    description: 'Reveals how many ship cells hide in a 3×3 area.',
    cost: 60,
    maxUses: null,
    pattern: [-1, 0, 1].flatMap((y) => [-1, 0, 1].map((x) => ({ x, y }))),
    kind: 'reveal',
    rotatable: false,
  },
  torpedo: {
    id: 'torpedo',
    name: 'Torpedo',
    short: 'TORPEDO',
    description: 'Runs along a row or column from the edge and strikes the first ship in its path.',
    cost: 70,
    maxUses: 2,
    pattern: [],
    kind: 'torpedo',
    rotatable: true,
  },
  airstrike: {
    id: 'airstrike',
    name: 'Airstrike',
    short: 'AIRSTRIKE',
    description: 'Hits a straight line of 4 cells, horizontal or vertical.',
    cost: 80,
    maxUses: 2,
    pattern: [-1, 0, 1, 2].map((x) => ({ x, y: 0 })),
    kind: 'area',
    rotatable: true,
    keepInside: true,
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
    rotatable: false,
  },
};

/** Power-ups in button order (cheapest first). */
export const POWER_UP_IDS = ['barrage', 'sonar', 'torpedo', 'airstrike', 'artillery'] as const;

export function getWeapon(id: string): WeaponDef | undefined {
  return WEAPONS[id];
}

/** Cells covered by a weapon aimed at `target`, clipped (or shifted, for `keepInside`) to the board. */
export function patternCells(
  weapon: WeaponDef,
  target: Coord,
  dims: { width: number; height: number },
  orientation: Orientation = 'H',
): Coord[] {
  const offsets = weapon.pattern.map((o) => (weapon.rotatable && orientation === 'V' ? { x: o.y, y: o.x } : o));
  let { x: tx, y: ty } = target;
  if (weapon.keepInside && offsets.length) {
    const xs = offsets.map((o) => o.x);
    const ys = offsets.map((o) => o.y);
    tx = Math.min(Math.max(tx, -Math.min(...xs)), dims.width - 1 - Math.max(...xs));
    ty = Math.min(Math.max(ty, -Math.min(...ys)), dims.height - 1 - Math.max(...ys));
  }
  return offsets.map((o) => ({ x: tx + o.x, y: ty + o.y })).filter((c) => inBounds(dims, c));
}

type LaneBoard = { width: number; height: number; shots: Record<string, CellState>; obstacles?: Record<string, ObstacleKind> };

/** Edge cell a torpedo launches from for a lane through `c`: the nearer edge (left/top on a tie). */
export function torpedoLaunch(c: Coord, dims: { width: number; height: number }, orientation: Orientation): Coord {
  if (orientation === 'H') return { x: c.x <= (dims.width - 1) / 2 ? 0 : dims.width - 1, y: c.y };
  return { x: c.x, y: c.y <= (dims.height - 1) / 2 ? 0 : dims.height - 1 };
}

/** Direction of travel for a launch cell, or null when it isn't on the matching edge. */
export function torpedoStep(launch: Coord, dims: { width: number; height: number }, orientation: Orientation): Coord | null {
  if (orientation === 'H') {
    if (launch.x === 0) return { x: 1, y: 0 };
    if (launch.x === dims.width - 1) return { x: -1, y: 0 };
    return null;
  }
  if (launch.y === 0) return { x: 0, y: 1 };
  if (launch.y === dims.height - 1) return { x: 0, y: -1 };
  return null;
}

/** Cells a torpedo can travel through from `launch`, stopping before the first rock or island. */
export function torpedoLane(board: LaneBoard, launch: Coord, orientation: Orientation): Coord[] {
  const step = torpedoStep(launch, board, orientation);
  if (!step) return [];
  const out: Coord[] = [];
  for (let c = launch; inBounds(board, c); c = { x: c.x + step.x, y: c.y + step.y }) {
    if (isSolidObstacle(obstacleAt(board, c))) break;
    out.push(c);
  }
  return out;
}

/** A lane is worth firing when it holds at least one unrevealed cell that isn't a visible reef. */
export function torpedoHasTarget(board: LaneBoard, lane: Coord[]): boolean {
  return lane.some((c) => cellAt(board, c) === 'unknown' && obstacleAt(board, c) !== 'reef');
}

export function weaponUsesLeft(player: Pick<PlayerState, 'weaponUses'>, weapon: WeaponDef): number {
  if (weapon.maxUses === null) return Infinity;
  return Math.max(0, weapon.maxUses - (player.weaponUses[weapon.id] ?? 0));
}

export function canUseWeapon(
  player: Pick<PlayerState, 'charge' | 'weaponUses'>,
  weapon: WeaponDef,
  rules: Pick<RuleSet, 'powerUpsEnabled'>,
): boolean {
  if (weapon.id === 'standard') return true;
  if (!rules.powerUpsEnabled) return false;
  return player.charge >= weapon.cost && weaponUsesLeft(player, weapon) > 0;
}

import type { ObstacleLevel, RuleSet, ShipDef } from './types';

const line = (length: number) => Array.from({ length }, (_, x) => ({ x, y: 0 }));

const ship = (id: string, name: string, length: number, count = 1): ShipDef => ({
  id,
  name,
  cells: line(length),
  count,
});

export const GridPresets = {
  small: { width: 8, height: 8 },
  medium: { width: 10, height: 10 },
  large: { width: 12, height: 12 },
  extraLarge: { width: 15, height: 15 },
} as const;

export type GridPresetId = keyof typeof GridPresets;

export const FleetPresets: Record<GridPresetId, ShipDef[]> = {
  small: [ship('battleship', 'Battleship', 4), ship('cruiser', 'Cruiser', 3, 2), ship('destroyer', 'Destroyer', 2)],
  medium: [
    ship('carrier', 'Carrier', 5),
    ship('battleship', 'Battleship', 4),
    ship('cruiser', 'Cruiser', 3),
    ship('submarine', 'Submarine', 3),
    ship('destroyer', 'Destroyer', 2),
  ],
  large: [
    ship('carrier', 'Carrier', 5),
    ship('battleship', 'Battleship', 4, 2),
    ship('cruiser', 'Cruiser', 3, 2),
    ship('destroyer', 'Destroyer', 2, 2),
  ],
  extraLarge: [
    ship('dreadnought', 'Dreadnought', 6),
    ship('carrier', 'Carrier', 5),
    ship('battleship', 'Battleship', 4, 2),
    ship('cruiser', 'Cruiser', 3, 3),
    ship('destroyer', 'Destroyer', 2, 3),
  ],
};

export const CLASSIC_FLEET = FleetPresets.medium;

export const BOARD_SIZE_MIN = 7;
export const BOARD_SIZE_MAX = 15;
export const DEFAULT_BOARD_SIZE = GridPresets.medium.width;

/** Board sizes offered in the setup UI; anything else in range is "custom". */
export const BoardSizePresets = {
  small: GridPresets.small.width,
  medium: GridPresets.medium.width,
  large: GridPresets.large.width,
} as const;

const SHIP_CLASS_BY_LENGTH: Record<number, [id: string, name: string]> = {
  6: ['dreadnought', 'Dreadnought'],
  5: ['carrier', 'Carrier'],
  4: ['battleship', 'Battleship'],
  3: ['cruiser', 'Cruiser'],
  2: ['destroyer', 'Destroyer'],
};

/** Ship lengths for square boards without a hand-tuned preset (~15–20% ship cells). */
const SCALED_FLEET_LENGTHS: Record<number, number[]> = {
  7: [4, 3, 2],
  9: [5, 4, 3, 2],
  11: [5, 4, 4, 3, 3, 2],
  13: [5, 5, 4, 4, 3, 3, 2, 2],
  14: [6, 5, 4, 4, 3, 3, 3, 2, 2],
};

const shaped = (id: string, name: string, cells: [number, number][]): ShipDef => ({
  id,
  name,
  cells: cells.map(([x, y]) => ({ x, y })),
  count: 1,
});

/** Tetromino ships used by the Arsenal mixed fleet. */
export const SHAPED_SHIPS = {
  T: shaped('tfrigate', 'T-Frigate', [
    [0, 0],
    [1, 0],
    [2, 0],
    [1, 1],
  ]),
  L: shaped('lcorvette', 'L-Corvette', [
    [0, 0],
    [0, 1],
    [1, 1],
    [2, 1],
  ]),
  Z: shaped('zraider', 'Z-Raider', [
    [0, 0],
    [1, 0],
    [1, 1],
    [2, 1],
  ]),
} as const;

type FleetSpec = (number | keyof typeof SHAPED_SHIPS)[];

/** Arsenal fleets: shaped ships replace mid-size straight ones, keeping ~16–20% ship cells. */
const MIXED_FLEET_SPECS: Record<number, FleetSpec> = {
  7: ['T', 3, 2],
  8: ['T', 'L', 3, 2],
  9: ['T', 'L', 'Z', 2],
  10: [5, 'T', 'L', 'Z', 2],
  11: [5, 4, 'T', 'L', 'Z', 2],
  12: [5, 4, 'T', 'L', 'Z', 3, 2],
  13: [5, 4, 'T', 'L', 'Z', 3, 3, 2],
  14: [6, 5, 'T', 'L', 'Z', 3, 3, 2, 2],
  15: [6, 5, 4, 'T', 'L', 'Z', 3, 3, 2, 2],
};

function fleetFromSpec(spec: FleetSpec): ShipDef[] {
  const counts = new Map<string, { def: ShipDef; count: number }>();
  for (const item of spec) {
    const def = typeof item === 'number' ? ship(...SHIP_CLASS_BY_LENGTH[item], item) : SHAPED_SHIPS[item];
    const entry = counts.get(def.id);
    if (entry) entry.count++;
    else counts.set(def.id, { def, count: 1 });
  }
  return [...counts.values()]
    .map(({ def, count }) => ({ ...def, count }))
    .sort((a, b) => b.cells.length - a.cells.length);
}

export function clampBoardSize(n: number): number {
  return Math.max(BOARD_SIZE_MIN, Math.min(BOARD_SIZE_MAX, Math.round(n)));
}

/** Fleet auto-scaled to an n×n board. Arsenal mixes in T/L/Z ships; Classic stays straight. */
export function fleetForSize(n: number, mode: GameMode = 'classic'): ShipDef[] {
  const size = clampBoardSize(n);
  if (mode === 'arsenal') return fleetFromSpec(MIXED_FLEET_SPECS[size]);
  const preset = (Object.keys(GridPresets) as GridPresetId[]).find((id) => GridPresets[id].width === size);
  if (preset) return FleetPresets[preset];
  return fleetFromSpec(SCALED_FLEET_LENGTHS[size]);
}

/** Grid + fleet overrides for an n×n board. */
export function boardRules(n: number, mode: GameMode = 'classic'): Pick<RuleSet, 'grid' | 'fleet'> {
  const size = clampBoardSize(n);
  return { grid: { width: size, height: size }, fleet: fleetForSize(size, mode) };
}

/** True when every cell of the ship lies on one row or column. */
export function isStraightShip(def: Pick<ShipDef, 'cells'>): boolean {
  return def.cells.every((c) => c.x === def.cells[0].x) || def.cells.every((c) => c.y === def.cells[0].y);
}

export const ONLINE_TURN_TIME_MS = 30_000;
export const ONLINE_PLACEMENT_TIME_MS = 60_000;
export const MAX_CONSECUTIVE_TIMEOUTS = 3;

export const CHARGE = {
  max: 100,
  perHit: 20,
  perSunk: 40,
  missStreakLength: 3,
  missStreakBonus: 10,
} as const;

export const DEFAULT_RULES: RuleSet = {
  grid: { ...GridPresets.medium },
  fleet: CLASSIC_FLEET,
  allowTouching: false,
  bonusShotOnHit: true,
  powerUpsEnabled: true,
  turnTimeMs: null,
  placementTimeMs: null,
};

export type GameMode = 'classic' | 'arsenal';

export function createRules(overrides: Partial<RuleSet> = {}): RuleSet {
  return {
    ...DEFAULT_RULES,
    ...overrides,
    grid: { ...(overrides.grid ?? DEFAULT_RULES.grid) },
    fleet: overrides.fleet ?? DEFAULT_RULES.fleet,
  };
}

export const OBSTACLE_LEVELS: ObstacleLevel[] = ['none', 'few', 'many'];

export function rulesForMode(mode: GameMode, overrides: Partial<RuleSet> = {}): RuleSet {
  return createRules({ powerUpsEnabled: mode === 'arsenal', ...overrides });
}

export function totalShipCells(rules: RuleSet): number {
  return rules.fleet.reduce((sum, def) => sum + def.cells.length * def.count, 0);
}

export function totalShips(rules: RuleSet): number {
  return rules.fleet.reduce((sum, def) => sum + def.count, 0);
}

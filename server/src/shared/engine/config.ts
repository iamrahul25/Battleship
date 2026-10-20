import type { RuleSet, ShipDef } from './types';

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

function fleetFromLengths(lengths: number[]): ShipDef[] {
  const counts = new Map<number, number>();
  for (const len of lengths) counts.set(len, (counts.get(len) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([len, count]) => ship(SHIP_CLASS_BY_LENGTH[len][0], SHIP_CLASS_BY_LENGTH[len][1], len, count));
}

export function clampBoardSize(n: number): number {
  return Math.max(BOARD_SIZE_MIN, Math.min(BOARD_SIZE_MAX, Math.round(n)));
}

/** Fleet auto-scaled to an n×n board. */
export function fleetForSize(n: number): ShipDef[] {
  const size = clampBoardSize(n);
  const preset = (Object.keys(GridPresets) as GridPresetId[]).find((id) => GridPresets[id].width === size);
  if (preset) return FleetPresets[preset];
  return fleetFromLengths(SCALED_FLEET_LENGTHS[size]);
}

/** Grid + fleet overrides for an n×n board. */
export function boardRules(n: number): Pick<RuleSet, 'grid' | 'fleet'> {
  const size = clampBoardSize(n);
  return { grid: { width: size, height: size }, fleet: fleetForSize(size) };
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

export function rulesForMode(mode: GameMode, overrides: Partial<RuleSet> = {}): RuleSet {
  return createRules({ powerUpsEnabled: mode === 'arsenal', ...overrides });
}

export function totalShipCells(rules: RuleSet): number {
  return rules.fleet.reduce((sum, def) => sum + def.cells.length * def.count, 0);
}

export function totalShips(rules: RuleSet): number {
  return rules.fleet.reduce((sum, def) => sum + def.count, 0);
}

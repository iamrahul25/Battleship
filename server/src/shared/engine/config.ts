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

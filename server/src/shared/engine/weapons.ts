import { inBounds } from './board';
import type { Coord, Orientation, PlayerState, RuleSet } from './types';

export interface WeaponDef {
  id: 'standard' | 'artillery' | 'sonar' | string;
  name: string;
  description: string;
  cost: number;
  maxUses: number | null;
  /** Offsets from the target center (horizontal orientation). */
  pattern: Coord[];
  kind: 'damage' | 'reveal';
  /** Future torpedo/airstrike lines. */
  rotatable: boolean;
}

export const WEAPONS: Record<string, WeaponDef> = {
  standard: {
    id: 'standard',
    name: 'Cannon',
    description: 'Single shot.',
    cost: 0,
    maxUses: null,
    pattern: [{ x: 0, y: 0 }],
    kind: 'damage',
    rotatable: false,
  },
  artillery: {
    id: 'artillery',
    name: 'Heavy Artillery',
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
    kind: 'damage',
    rotatable: false,
  },
  sonar: {
    id: 'sonar',
    name: 'Sonar Scan',
    description: 'Reveals how many ship cells hide in a 3×3 area.',
    cost: 60,
    maxUses: null,
    pattern: [-1, 0, 1].flatMap((y) => [-1, 0, 1].map((x) => ({ x, y }))),
    kind: 'reveal',
    rotatable: false,
  },
};

export const POWER_UP_IDS = ['artillery', 'sonar'] as const;

export function getWeapon(id: string): WeaponDef | undefined {
  return WEAPONS[id];
}

/** In-bounds cells covered by a weapon aimed at `target`. */
export function patternCells(
  weapon: WeaponDef,
  target: Coord,
  dims: { width: number; height: number },
  orientation: Orientation = 'H',
): Coord[] {
  return weapon.pattern
    .map((o) => (weapon.rotatable && orientation === 'V' ? { x: o.y, y: o.x } : o))
    .map((o) => ({ x: target.x + o.x, y: target.y + o.y }))
    .filter((c) => inBounds(dims, c));
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

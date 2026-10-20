import { allCells, cellAt, inBounds, key, neighbours4 } from '../board';
import { fleetInstances } from '../placement';
import type { Rng } from '../rng';
import type { Coord, Orientation, PublicView, RuleSet, ShipDef, ShotResult, SonarResult, TargetView } from '../types';
import { canUseWeapon, getWeapon, patternCells, torpedoLane, type WeaponDef } from '../weapons';

export type Difficulty = 'easy' | 'medium' | 'hard';

export type BotAction =
  | { type: 'FIRE'; target: Coord }
  | { type: 'USE_WEAPON'; weaponId: string; target: Coord; orientation?: Orientation };

/** Exactly what a human opponent could see. Bots never get the real enemy board. */
export interface BotView {
  rules: RuleSet;
  target: TargetView;
  /** One entry per enemy ship instance still afloat. */
  remainingFleet: ShipDef[];
  charge: number;
  weaponUses: Record<string, number>;
  sonar: SonarResult[];
  /** Result of this bot's most recent standard shot, if any. */
  lastShot?: ShotResult;
}

export function remainingFleetFor(rules: RuleSet, target: TargetView): ShipDef[] {
  const sunkCounts = new Map<string, number>();
  for (const s of target.ships) sunkCounts.set(s.defId, (sunkCounts.get(s.defId) ?? 0) + 1);
  const out: ShipDef[] = [];
  for (const inst of fleetInstances(rules)) {
    const sunk = sunkCounts.get(inst.def.id) ?? 0;
    if (inst.index >= sunk) out.push({ ...inst.def, count: 1 });
  }
  return out;
}

/** Visible obstacles can never hold a ship, so bots treat their unfired cells as known water. */
export function withObstaclesAsWater(target: TargetView): TargetView {
  if (!target.obstacles) return target;
  const shots = { ...target.shots };
  for (const k of Object.keys(target.obstacles)) if (!shots[k]) shots[k] = 'knownEmpty';
  return { ...target, shots };
}

export function botViewFromPublic(view: PublicView): BotView {
  return {
    rules: view.rules,
    target: withObstaclesAsWater(view.enemyBoard),
    remainingFleet: remainingFleetFor(view.rules, view.enemyBoard),
    charge: view.me.charge,
    weaponUses: view.me.weaponUses,
    sonar: view.log.filter((e) => e.by === view.viewer && e.sonar).map((e) => e.sonar!),
    lastShot: view.log.filter((e) => e.by === view.viewer && e.weaponId === 'standard').at(-1)?.results[0],
  };
}

export function botViewFromTarget(rules: RuleSet, target: TargetView): BotView {
  return { rules, target: withObstaclesAsWater(target), remainingFleet: remainingFleetFor(rules, target), charge: 0, weaponUses: {}, sonar: [] };
}

export const unknownCells = (t: TargetView) => allCells(t).filter((c) => cellAt(t, c) === 'unknown');

/** Hits on ships that are not sunk yet. */
export const unresolvedHits = (t: TargetView) => allCells(t).filter((c) => cellAt(t, c) === 'hit');

/** Unknown cells proven empty by a sonar scan whose count is fully explained by known hits. */
export function sonarEmptyCells(view: BotView): Set<string> {
  const out = new Set<string>();
  for (const s of view.sonar) {
    const known = s.area.filter((c) => {
      const st = cellAt(view.target, c);
      return st === 'hit' || st === 'sunk';
    }).length;
    if (s.shipCellsFound - known <= 0) {
      for (const c of s.area) if (cellAt(view.target, c) === 'unknown') out.add(key(c));
    }
  }
  return out;
}

/** Sonar areas that still hide ship cells, with how many. */
export function sonarHotAreas(view: BotView): { cells: Coord[]; hidden: number }[] {
  const out: { cells: Coord[]; hidden: number }[] = [];
  for (const s of view.sonar) {
    const known = s.area.filter((c) => {
      const st = cellAt(view.target, c);
      return st === 'hit' || st === 'sunk';
    }).length;
    const hidden = s.shipCellsFound - known;
    const cells = s.area.filter((c) => cellAt(view.target, c) === 'unknown');
    if (hidden > 0 && cells.length > 0) out.push({ cells, hidden });
  }
  return out;
}

export function unknownNeighbours(t: TargetView, c: Coord): Coord[] {
  return neighbours4(t, c).filter((n) => cellAt(t, n) === 'unknown');
}

export function affordable(view: BotView, weaponId: string): WeaponDef | null {
  const w = getWeapon(weaponId);
  if (!w || !view.rules.powerUpsEnabled) return null;
  return canUseWeapon({ charge: view.charge, weaponUses: view.weaponUses }, w, view.rules) ? w : null;
}

/** Number of unknown cells a weapon centered at `c` would touch. */
export function unknownInPattern(view: BotView, weapon: WeaponDef, c: Coord, orientation: Orientation = 'H'): number {
  return patternCells(weapon, c, view.target, orientation).filter((p) => cellAt(view.target, p) === 'unknown').length;
}

/** Best weapon center by a per-cell score function (ties broken by rng order). Rotatable weapons try both orientations. */
export function bestCenter(
  view: BotView,
  weapon: WeaponDef,
  score: (c: Coord) => number,
  pickOrder: Coord[],
): { center: Coord; value: number; orientation: Orientation } | null {
  let best: { center: Coord; value: number; orientation: Orientation } | null = null;
  const orientations: Orientation[] = weapon.rotatable ? ['H', 'V'] : ['H'];
  for (const c of pickOrder) {
    if (!inBounds(view.target, c)) continue;
    for (const orientation of orientations) {
      const cells = patternCells(weapon, c, view.target, orientation).filter((p) => cellAt(view.target, p) === 'unknown');
      if (cells.length === 0) continue;
      const value = cells.reduce((sum, p) => sum + score(p), 0);
      if (!best || value > best.value) best = { center: c, value, orientation };
    }
  }
  return best;
}

export interface TorpedoOption {
  launch: Coord;
  orientation: Orientation;
  /** Unrevealed cells the torpedo would sweep, in travel order. */
  cells: Coord[];
}

/** Every launch (both edges of every row and column) whose lane still has an unrevealed cell. */
export function torpedoOptions(view: BotView): TorpedoOption[] {
  const t = view.target;
  const out: TorpedoOption[] = [];
  const add = (launch: Coord, orientation: Orientation) => {
    const lane = torpedoLane(t, launch, orientation);
    const cells = lane.filter((c) => cellAt(t, c) === 'unknown');
    if (cells.length) out.push({ launch, orientation, cells });
  };
  for (let y = 0; y < t.height; y++) {
    add({ x: 0, y }, 'H');
    add({ x: t.width - 1, y }, 'H');
  }
  for (let x = 0; x < t.width; x++) {
    add({ x, y: 0 }, 'V');
    add({ x, y: t.height - 1 }, 'V');
  }
  return out;
}

/** A legal, randomly aimed use of `weapon`, or null when it has nothing left to hit. */
export function randomWeaponAction(view: BotView, weapon: WeaponDef, rng: Rng): BotAction | null {
  const unknown = unknownCells(view.target);
  if (!unknown.length) return null;
  if (weapon.kind === 'random') return { type: 'USE_WEAPON', weaponId: weapon.id, target: rng.pick(unknown) };
  if (weapon.kind === 'torpedo') {
    const options = torpedoOptions(view);
    if (!options.length) return null;
    const o = rng.pick(options);
    return { type: 'USE_WEAPON', weaponId: weapon.id, target: o.launch, orientation: o.orientation };
  }
  const orientation: Orientation = weapon.rotatable && rng.next() < 0.5 ? 'V' : 'H';
  const centers = unknown.filter((c) => unknownInPattern(view, weapon, c, orientation) > 0);
  if (!centers.length) return null;
  return { type: 'USE_WEAPON', weaponId: weapon.id, target: rng.pick(centers), orientation };
}

/** Contiguous unresolved-hit lines (length ≥ 2) give the open cells at both ends. */
export function lineEndCandidates(t: TargetView, hits: Coord[]): Coord[] {
  const hitSet = new Set(hits.map(key));
  const out = new Map<string, Coord>();
  for (const h of hits) {
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
    ]) {
      if (!hitSet.has(key({ x: h.x + dx, y: h.y + dy }))) continue;
      // walk both directions along the line
      let a = { ...h };
      while (hitSet.has(key({ x: a.x - dx, y: a.y - dy }))) a = { x: a.x - dx, y: a.y - dy };
      let b = { ...h };
      while (hitSet.has(key({ x: b.x + dx, y: b.y + dy }))) b = { x: b.x + dx, y: b.y + dy };
      for (const end of [
        { x: a.x - dx, y: a.y - dy },
        { x: b.x + dx, y: b.y + dy },
      ]) {
        if (inBounds(t, end) && cellAt(t, end) === 'unknown') out.set(key(end), end);
      }
    }
  }
  return [...out.values()];
}

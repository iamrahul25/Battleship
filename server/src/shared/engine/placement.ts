import { createBoard, inBounds, key, neighbours8 } from './board';
import { obstacleFields } from './obstacles';
import type { Rng } from './rng';
import type { Board, Coord, ObstacleKind, PlacedShip, Rotation, RuleSet, ShipDef } from './types';

export const ROTATIONS: Rotation[] = [0, 90, 180, 270];

function rotateCell(c: Coord, rotation: Rotation): Coord {
  switch (rotation) {
    case 0:
      return { x: c.x, y: c.y };
    case 90:
      return { x: -c.y, y: c.x };
    case 180:
      return { x: -c.x, y: -c.y };
    case 270:
      return { x: c.y, y: -c.x };
  }
}

/** Shape cells after rotation, normalized so the bounding box starts at (0,0). */
export function shapeCells(def: Pick<ShipDef, 'cells'>, rotation: Rotation): Coord[] {
  const rotated = def.cells.map((c) => rotateCell(c, rotation));
  const minX = Math.min(...rotated.map((c) => c.x));
  const minY = Math.min(...rotated.map((c) => c.y));
  return rotated.map((c) => ({ x: c.x - minX, y: c.y - minY }));
}

export function shipCells(def: Pick<ShipDef, 'cells'>, origin: Coord, rotation: Rotation): Coord[] {
  return shapeCells(def, rotation).map((c) => ({ x: c.x + origin.x, y: c.y + origin.y }));
}

/** Rotations that produce distinct shapes (a straight ship has only 0 and 90). */
export function uniqueRotations(def: Pick<ShipDef, 'cells'>): Rotation[] {
  const seen = new Set<string>();
  const out: Rotation[] = [];
  for (const r of ROTATIONS) {
    const sig = shapeCells(def, r)
      .map(key)
      .sort()
      .join('|');
    if (!seen.has(sig)) {
      seen.add(sig);
      out.push(r);
    }
  }
  return out;
}

export function shapeSize(def: Pick<ShipDef, 'cells'>, rotation: Rotation) {
  const cells = shapeCells(def, rotation);
  return {
    width: Math.max(...cells.map((c) => c.x)) + 1,
    height: Math.max(...cells.map((c) => c.y)) + 1,
  };
}

export type PlacementError = 'OUT_OF_BOUNDS' | 'OVERLAP' | 'TOUCHING' | 'OBSTACLE';

function blockedSets(board: Board, rules: RuleSet, ignoreUid?: string) {
  const occupied = new Set<string>();
  const halo = new Set<string>();
  for (const ship of board.ships) {
    if (ship.uid === ignoreUid) continue;
    for (const c of ship.cells) {
      occupied.add(key(c));
      if (!rules.allowTouching) for (const n of neighbours8(board, c)) halo.add(key(n));
    }
  }
  return { occupied, halo };
}

export function placementError(
  board: Board,
  def: Pick<ShipDef, 'cells'>,
  origin: Coord,
  rotation: Rotation,
  rules: RuleSet,
  ignoreUid?: string,
): PlacementError | null {
  const cells = shipCells(def, origin, rotation);
  if (!cells.every((c) => inBounds(board, c))) return 'OUT_OF_BOUNDS';
  if (cells.some((c) => board.obstacles?.[key(c)])) return 'OBSTACLE';
  const { occupied, halo } = blockedSets(board, rules, ignoreUid);
  if (cells.some((c) => occupied.has(key(c)))) return 'OVERLAP';
  if (cells.some((c) => halo.has(key(c)))) return 'TOUCHING';
  return null;
}

export function canPlace(
  board: Board,
  def: Pick<ShipDef, 'cells'>,
  origin: Coord,
  rotation: Rotation,
  rules: RuleSet,
  ignoreUid?: string,
): boolean {
  return placementError(board, def, origin, rotation, rules, ignoreUid) === null;
}

export function makePlacedShip(def: ShipDef, index: number, origin: Coord, rotation: Rotation): PlacedShip {
  return {
    uid: `${def.id}#${index}`,
    defId: def.id,
    origin: { ...origin },
    rotation,
    cells: shipCells(def, origin, rotation),
    hits: 0,
  };
}

/** Returns a new board with the ship placed (replacing any ship with the same uid). */
export function placeShip(board: Board, ship: PlacedShip): Board {
  return { ...board, ships: [...board.ships.filter((s) => s.uid !== ship.uid), ship] };
}

export function removeShip(board: Board, uid: string): Board {
  return { ...board, ships: board.ships.filter((s) => s.uid !== uid) };
}

/** Every ship instance the fleet requires, largest first. */
export function fleetInstances(rules: RuleSet): { uid: string; def: ShipDef; index: number }[] {
  const out: { uid: string; def: ShipDef; index: number }[] = [];
  for (const def of rules.fleet) {
    for (let i = 0; i < def.count; i++) out.push({ uid: `${def.id}#${i}`, def, index: i });
  }
  return out.sort((a, b) => b.def.cells.length - a.def.cells.length);
}

export function findDef(rules: RuleSet, defId: string): ShipDef | undefined {
  return rules.fleet.find((d) => d.id === defId);
}

export interface FleetInput {
  defId: string;
  origin: Coord;
  rotation: Rotation;
}

/**
 * Validates a full fleet against the rules and rebuilds ship cells from defs,
 * so client-supplied cells/hits are never trusted.
 */
export function validateFleet(
  rules: RuleSet,
  input: FleetInput[],
  obstacles?: Record<string, ObstacleKind>,
): { ok: true; ships: PlacedShip[] } | { ok: false; reason: string } {
  const counts = new Map<string, number>();
  let board: Board = { ...createBoard(rules.grid.width, rules.grid.height), ...obstacleFields(obstacles) };
  for (const item of input) {
    const def = findDef(rules, item.defId);
    if (!def) return { ok: false, reason: `Unknown ship ${item.defId}` };
    if (!ROTATIONS.includes(item.rotation)) return { ok: false, reason: 'Bad rotation' };
    const index = counts.get(def.id) ?? 0;
    if (index >= def.count) return { ok: false, reason: `Too many ${def.id}` };
    counts.set(def.id, index + 1);
    const err = placementError(board, def, item.origin, item.rotation, rules);
    if (err) return { ok: false, reason: `${def.id}: ${err}` };
    board = placeShip(board, makePlacedShip(def, index, item.origin, item.rotation));
  }
  for (const def of rules.fleet) {
    if ((counts.get(def.id) ?? 0) !== def.count) return { ok: false, reason: `Missing ${def.id}` };
  }
  return { ok: true, ships: board.ships };
}

export interface Candidate {
  origin: Coord;
  rotation: Rotation;
  cells: Coord[];
}

/** All legal placements for a ship given the ships already on the board. */
export function placementCandidates(board: Board, def: ShipDef, rules: RuleSet): Candidate[] {
  const { occupied, halo } = blockedSets(board, rules);
  const out: Candidate[] = [];
  for (const rotation of uniqueRotations(def)) {
    const size = shapeSize(def, rotation);
    for (let y = 0; y + size.height <= board.height; y++) {
      for (let x = 0; x + size.width <= board.width; x++) {
        const cells = shipCells(def, { x, y }, rotation);
        if (cells.some((c) => occupied.has(key(c)) || halo.has(key(c)) || board.obstacles?.[key(c)])) continue;
        out.push({ origin: { x, y }, rotation, cells });
      }
    }
  }
  return out;
}

export interface RandomFleetOptions {
  /** Relative weight of a candidate placement (> 0). Defaults to uniform. */
  weight?: (candidate: Candidate, placed: PlacedShip[], board: Board) => number;
  maxAttempts?: number;
  /** Obstacles already on the board; ships are placed around them. */
  obstacles?: Record<string, ObstacleKind>;
}

function weightedPick<T>(items: T[], weights: number[], rng: Rng): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng.next() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r < 0) return items[i];
  }
  return items[items.length - 1];
}

/** Random valid fleet. Restarts from scratch when a ship cannot fit. */
export function randomFleet(rules: RuleSet, rng: Rng, options: RandomFleetOptions = {}): PlacedShip[] {
  const maxAttempts = options.maxAttempts ?? 500;
  const instances = fleetInstances(rules);
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let board: Board = { ...createBoard(rules.grid.width, rules.grid.height), ...obstacleFields(options.obstacles) };
    let failed = false;
    for (const inst of instances) {
      const candidates = placementCandidates(board, inst.def, rules);
      if (candidates.length === 0) {
        failed = true;
        break;
      }
      const choice = options.weight
        ? weightedPick(
            candidates,
            candidates.map((c) => Math.max(1e-6, options.weight!(c, board.ships, board))),
            rng,
          )
        : rng.pick(candidates);
      board = placeShip(board, makePlacedShip(inst.def, inst.index, choice.origin, choice.rotation));
    }
    if (!failed) return board.ships;
  }
  throw new Error('Unable to place fleet with current rules');
}

export function isFleetComplete(board: Board, rules: RuleSet): boolean {
  return board.ships.length === fleetInstances(rules).length;
}

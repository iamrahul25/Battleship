import { allCells, cellAt, inBounds, key, neighbours8 } from '../board';
import { shapeCells, shapeSize, uniqueRotations } from '../placement';
import type { Rng } from '../rng';
import type { CellState, Coord, ShipDef } from '../types';
import { affordable, bestCenter, type BotAction, type BotView, sonarEmptyCells, sonarHotAreas, unknownCells, unresolvedHits } from './common';

const HIT_WEIGHT = 30;
const ARTILLERY_THRESHOLD = 2.2;

/**
 * Probability density: for every afloat ship, every placement consistent with the
 * known board adds weight to the unknown cells it covers. Placements through
 * unresolved hits are heavily favoured so wounded ships get finished quickly.
 */
export function densityMap(view: BotView): number[] {
  const t = view.target;
  const { width, height } = t;
  const density = new Array<number>(width * height).fill(0);
  const empties = sonarEmptyCells(view);
  const state = (c: Coord): CellState => cellAt(t, c);
  const blocked = (c: Coord) => {
    const s = state(c);
    return s === 'miss' || s === 'knownEmpty' || s === 'sunk' || empties.has(key(c));
  };

  // Identical ship defs share their enumeration.
  const groups = new Map<string, { def: ShipDef; count: number }>();
  for (const def of view.remainingFleet) {
    const sig = `${def.id}:${def.cells.length}`;
    const g = groups.get(sig);
    if (g) g.count++;
    else groups.set(sig, { def, count: 1 });
  }

  for (const { def, count } of groups.values()) {
    for (const rotation of uniqueRotations(def)) {
      const shape = shapeCells(def, rotation);
      const size = shapeSize(def, rotation);
      for (let oy = 0; oy + size.height <= height; oy++) {
        for (let ox = 0; ox + size.width <= width; ox++) {
          const cells = shape.map((c) => ({ x: c.x + ox, y: c.y + oy }));
          if (cells.some(blocked)) continue;
          if (!view.rules.allowTouching) {
            const own = new Set(cells.map(key));
            let touches = false;
            for (const c of cells) {
              for (const n of neighbours8(t, c)) {
                if (own.has(key(n))) continue;
                const s = state(n);
                if (s === 'hit' || s === 'sunk') {
                  touches = true;
                  break;
                }
              }
              if (touches) break;
            }
            if (touches) continue;
          }
          const hitsCovered = cells.filter((c) => state(c) === 'hit').length;
          const w = count * Math.pow(HIT_WEIGHT, hitsCovered);
          for (const c of cells) if (state(c) === 'unknown') density[c.y * width + c.x] += w;
        }
      }
    }
  }

  for (const area of sonarHotAreas(view)) {
    const boost = 1 + (2 * area.hidden) / area.cells.length;
    for (const c of area.cells) density[c.y * width + c.x] *= boost;
  }
  return density;
}

/** "Admiral": fire at the most probable cell; spend power-ups when they beat a normal shot. */
export function hardChoose(view: BotView, rng: Rng): BotAction {
  const t = view.target;
  const density = densityMap(view);
  const at = (c: Coord) => (inBounds(t, c) ? density[c.y * t.width + c.x] : 0);
  const unknown = unknownCells(t);
  const order = rng.shuffle(unknown.slice());

  let best: Coord | null = null;
  let bestValue = -1;
  for (const c of order) {
    const v = at(c);
    if (v > bestValue) {
      bestValue = v;
      best = c;
    }
  }
  if (!best || bestValue <= 0) return { type: 'FIRE', target: rng.pick(unknown) };

  const artillery = affordable(view, 'artillery');
  if (artillery) {
    const centers = rng.shuffle(allCells(t));
    const option = bestCenter(view, artillery, at, centers);
    if (option && option.value >= ARTILLERY_THRESHOLD * bestValue) {
      return { type: 'USE_WEAPON', weaponId: 'artillery', target: option.center };
    }
  }

  const sonar = affordable(view, 'sonar');
  const artilleryExhausted = (view.weaponUses.artillery ?? 0) >= 2;
  if (sonar && artilleryExhausted && unresolvedHits(t).length === 0 && sonarHotAreas(view).length === 0) {
    const option = bestCenter(view, sonar, at, rng.shuffle(allCells(t)));
    if (option && option.value > 4 * bestValue) return { type: 'USE_WEAPON', weaponId: 'sonar', target: option.center };
  }

  return { type: 'FIRE', target: best };
}

import { key } from '../board';
import { isStraightShip } from '../config';
import type { Rng } from '../rng';
import type { Coord } from '../types';
import {
  affordable,
  bestCenter,
  type BotAction,
  type BotView,
  lineEndCandidates,
  sonarEmptyCells,
  sonarHotAreas,
  torpedoOptions,
  unknownCells,
  unknownNeighbours,
  unresolvedHits,
} from './common';

/** Share of hunt shots that ignore parity, keeping Medium clearly below Hard. */
const MEDIUM_SLOPPINESS = 0.5;

/** "Captain": hunt on a parity pattern, then target along the line of hits until sunk. */
export function mediumChoose(view: BotView, rng: Rng): BotAction {
  const t = view.target;
  const empties = sonarEmptyCells(view);
  const unknown = unknownCells(t).filter((c) => !empties.has(key(c)));
  const pool = unknown.length ? unknown : unknownCells(t);
  const hits = unresolvedHits(t);

  if (hits.length) {
    const lineEnds = lineEndCandidates(t, hits).filter((c) => !empties.has(key(c)));
    const adjacent = hits.flatMap((h) => unknownNeighbours(t, h)).filter((c) => !empties.has(key(c)));
    const candidates = lineEnds.length ? lineEnds : adjacent;

    const artillery = affordable(view, 'artillery');
    if (artillery && candidates.length) {
      const near = new Set(candidates.map(key));
      const best = bestCenter(view, artillery, (c) => (near.has(key(c)) ? 3 : 1), rng.shuffle(candidates.slice()));
      if (best) return { type: 'USE_WEAPON', weaponId: 'artillery', target: best.center };
    }
    const airstrike = affordable(view, 'airstrike');
    if (airstrike && lineEnds.length) {
      const near = new Set(candidates.map(key));
      const best = bestCenter(view, airstrike, (c) => (near.has(key(c)) ? 3 : 1), rng.shuffle(candidates.slice()));
      if (best && best.value >= 5) return { type: 'USE_WEAPON', weaponId: 'airstrike', target: best.center };
    }
    if (candidates.length) return { type: 'FIRE', target: rng.pick(candidates) };
  }

  // Hunt mode
  const hot = sonarHotAreas(view);
  if (hot.length) {
    const area = hot.sort((a, b) => b.hidden / b.cells.length - a.hidden / a.cells.length)[0];
    return { type: 'FIRE', target: rng.pick(area.cells) };
  }

  const torpedo = affordable(view, 'torpedo');
  if (torpedo && rng.next() < 0.35) {
    const longest = torpedoOptions(view).sort((a, b) => b.cells.length - a.cells.length)[0];
    if (longest && longest.cells.length >= Math.ceil(t.width / 2)) {
      return { type: 'USE_WEAPON', weaponId: 'torpedo', target: longest.drop };
    }
  }
  const barrage = affordable(view, 'barrage');
  if (barrage && pool.length >= 8 && rng.next() < 0.35) return { type: 'USE_WEAPON', weaponId: 'barrage', target: rng.pick(pool) };

  const sonar = affordable(view, 'sonar');
  const artilleryLeft = affordable(view, 'artillery') !== null || (view.weaponUses.artillery ?? 0) < 2;
  if (sonar && (!artilleryLeft || rng.next() < 0.3)) {
    const unknownSet = new Set(pool.map(key));
    const best = bestCenter(view, sonar, (c) => (unknownSet.has(key(c)) ? 1 : 0), rng.shuffle(pool.slice()));
    if (best && best.value >= 6) return { type: 'USE_WEAPON', weaponId: 'sonar', target: best.center };
  }

  // A diagonal stride of n only guarantees coverage for straight ships of length n; any other
  // shape contains an adjacent pair, so stride 2 is the widest safe one.
  const strides = view.remainingFleet.map((s) => (isStraightShip(s) ? s.cells.length : 2));
  const minStride = Math.min(...strides, Infinity);
  const step = Number.isFinite(minStride) ? Math.max(1, minStride) : 1;
  const parity = pool.filter((c: Coord) => (c.x + c.y) % step === 0);
  const sloppy = rng.next() < MEDIUM_SLOPPINESS;
  return { type: 'FIRE', target: rng.pick(parity.length && !sloppy ? parity : pool) };
}

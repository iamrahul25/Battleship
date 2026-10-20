import type { Rng } from '../rng';
import { POWER_UP_IDS } from '../weapons';
import { affordable, type BotAction, type BotView, randomWeaponAction, unknownCells, unknownNeighbours } from './common';

/** "Cadet": random fire, sometimes follows up on hits, uses power-ups at random. */
export function easyChoose(view: BotView, rng: Rng): BotAction {
  const unknown = unknownCells(view.target);

  const usable = POWER_UP_IDS.map((id) => affordable(view, id)).filter((w) => w !== null);
  if (usable.length && rng.next() < 0.3) {
    const action = randomWeaponAction(view, rng.pick(usable), rng);
    if (action) return action;
  }

  const last = view.lastShot;
  if (last?.result === 'hit' && rng.next() < 0.5) {
    const adj = unknownNeighbours(view.target, last.coord);
    if (adj.length) return { type: 'FIRE', target: rng.pick(adj) };
  }
  return { type: 'FIRE', target: rng.pick(unknown) };
}

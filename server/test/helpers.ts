import {
  applyAction,
  createGame,
  createRng,
  createRules,
  type GameState,
  makePlacedShip,
  type PlacedShip,
  type PlayerIndex,
  type RuleSet,
} from '../src/shared/engine';

/** Deterministic classic layout: ships in rows 0,2,4,6,8 starting at column 0. */
export function rowFleet(rules: RuleSet = createRules()): PlacedShip[] {
  const sorted = rules.fleet.slice().sort((a, b) => b.cells.length - a.cells.length);
  const out: PlacedShip[] = [];
  let row = 0;
  for (const def of sorted) {
    for (let i = 0; i < def.count; i++) {
      out.push(makePlacedShip(def, i, { x: 0, y: row }, 0));
      row += 2;
    }
  }
  return out;
}

export function must<T extends { error?: string }>(r: T): T {
  if (r.error) throw new Error(`Unexpected engine error ${r.error}`);
  return r;
}

/** Game in battle phase with both players using `rowFleet`, player 0 first. */
export function battleGame(overrides: Partial<RuleSet> = {}): GameState {
  const rules = createRules(overrides);
  let s = createGame(rules, 1);
  for (const p of [0, 1] as PlayerIndex[]) {
    s = must(applyAction(s, { type: 'PLACE_FLEET', player: p, ships: rowFleet(rules) })).state;
    s = must(applyAction(s, { type: 'READY', player: p })).state;
  }
  return { ...s, activePlayer: 0 };
}

export { createRng };

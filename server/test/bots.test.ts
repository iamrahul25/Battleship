import { describe, expect, it } from 'vitest';
import {
  applyAction,
  BOARD_SIZE_MAX,
  BOARD_SIZE_MIN,
  boardRules,
  botPlaceFleet,
  botViewFromPublic,
  cellAt,
  createBot,
  createGame,
  createRng,
  createRules,
  densityMap,
  type Difficulty,
  getPublicView,
  layoutSignature,
  validateFleet,
} from '../src/shared/engine';
import { runSimulation, simulateGame } from '../scripts/simulate';
import { battleGame, must } from './helpers';

const rules = createRules();
const difficulties: Difficulty[] = ['easy', 'medium', 'hard'];

describe('bot placement', () => {
  it.each(difficulties)('%s places valid fleets', (d) => {
    for (let seed = 0; seed < 100; seed++) {
      const ships = botPlaceFleet(d, rules, createRng(seed));
      expect(validateFleet(rules, ships.map((s) => ({ defId: s.defId, origin: s.origin, rotation: s.rotation }))).ok).toBe(true);
    }
  });
  it('hard never repeats the previous layout', () => {
    const rng = createRng(5);
    let prev = '';
    for (let i = 0; i < 30; i++) {
      const sig = layoutSignature(botPlaceFleet('hard', rules, rng));
      expect(sig).not.toBe(prev);
      prev = sig;
    }
  });
});

describe('bot decisions', () => {
  it.each(difficulties)('%s never fires an illegal shot (classic + arsenal)', (d) => {
    for (let seed = 1; seed <= 15; seed++) {
      expect(simulateGame(d, seed).illegal).toBe(0);
      expect(simulateGame(d, seed, createRules()).illegal).toBe(0);
    }
  });

  it.each(difficulties)('%s sinks mixed T/L/Z fleets on every board size', (d) => {
    for (let n = BOARD_SIZE_MIN; n <= BOARD_SIZE_MAX; n++) {
      const r = createRules(boardRules(n, 'arsenal'));
      const res = simulateGame(d, n, r);
      expect(res.illegal).toBe(0);
      expect(res.shots).toBeLessThanOrEqual(n * n);
    }
  });

  it('bots only receive the public view (no cheating)', () => {
    const s = battleGame();
    const view = botViewFromPublic(getPublicView(s, 1));
    expect(view.target.ships).toHaveLength(0);
    expect(JSON.stringify(view)).not.toMatch(/"origin"/);
  });

  it('hard finishes a wounded ship', () => {
    let s = battleGame({ bonusShotOnHit: false });
    s = must(applyAction(s, { type: 'FIRE', player: 0, target: { x: 2, y: 0 } })).state; // carrier hit
    s = must(applyAction(s, { type: 'FIRE', player: 1, target: { x: 9, y: 9 } })).state;
    const view = botViewFromPublic(getPublicView(s, 0));
    const bot = createBot('hard', s.rules, createRng(1));
    const action = bot.chooseAction(view);
    expect(action.type).toBe('FIRE');
    expect([{ x: 1, y: 0 }, { x: 3, y: 0 }, { x: 2, y: 1 }]).toContainEqual(action.target);
  });

  it('medium follows a line of hits', () => {
    let s = battleGame({ bonusShotOnHit: true, powerUpsEnabled: false });
    s = must(applyAction(s, { type: 'FIRE', player: 0, target: { x: 1, y: 0 } })).state;
    s = must(applyAction(s, { type: 'FIRE', player: 0, target: { x: 2, y: 0 } })).state;
    const view = botViewFromPublic(getPublicView(s, 0));
    const action = createBot('medium', s.rules, createRng(3)).chooseAction(view);
    expect([{ x: 0, y: 0 }, { x: 3, y: 0 }]).toContainEqual(action.target);
  });

  it('density is zero on known cells and respects no-touching', () => {
    let s = battleGame({ bonusShotOnHit: false });
    for (const c of [{ x: 0, y: 8 }, { x: 1, y: 8 }]) {
      s = must(applyAction(s, { type: 'FIRE', player: 0, target: c })).state;
      s = must(applyAction(s, { type: 'FIRE', player: 1, target: { x: c.x, y: 9 } })).state;
    }
    const view = botViewFromPublic(getPublicView(s, 0));
    const d = densityMap(view);
    for (let y = 0; y < 10; y++)
      for (let x = 0; x < 10; x++) if (cellAt(view.target, { x, y }) !== 'unknown') expect(d[y * 10 + x]).toBe(0);
    expect(view.remainingFleet).toHaveLength(4);
  });

  it('bots use power-ups in arsenal mode', () => {
    const totals = difficulties.map((d) => runSimulation(d, 20, createRules({ bonusShotOnHit: false })).powerUps);
    for (const t of totals) expect(t).toBeGreaterThan(0);
  });

  it('a full bot vs bot game completes', () => {
    const r = createRules();
    const bots = [createBot('medium', r, createRng(1)), createBot('hard', r, createRng(2))];
    let s = createGame(r, 7);
    for (const p of [0, 1] as const) {
      s = must(applyAction(s, { type: 'PLACE_FLEET', player: p, ships: bots[p].placeFleet() })).state;
      s = must(applyAction(s, { type: 'READY', player: p })).state;
    }
    let guard = 0;
    while (s.phase === 'battle' && guard++ < 500) {
      const p = s.activePlayer;
      const a = bots[p].chooseAction(botViewFromPublic(getPublicView(s, p)));
      s = must(
        a.type === 'FIRE'
          ? applyAction(s, { type: 'FIRE', player: p, target: a.target })
          : applyAction(s, { type: 'USE_WEAPON', player: p, weaponId: a.weaponId, target: a.target, orientation: a.orientation }),
      ).state;
    }
    expect(s.phase).toBe('finished');
  });
});

describe('difficulty ordering', () => {
  it('mean shots: Hard < Medium < Easy', () => {
    const [easy, medium, hard] = difficulties.map((d) => runSimulation(d, 120).shots.mean);
    expect(hard).toBeLessThan(medium);
    expect(medium).toBeLessThan(easy);
    expect(hard).toBeLessThan(55);
    expect(medium).toBeLessThan(70);
  }, 120_000);

  it('hard decision is fast (< 20 ms)', () => {
    const s = battleGame();
    const view = botViewFromPublic(getPublicView(s, 0));
    const bot = createBot('hard', s.rules, createRng(1));
    const start = performance.now();
    for (let i = 0; i < 20; i++) bot.chooseAction(view);
    expect((performance.now() - start) / 20).toBeLessThan(20);
  });
});

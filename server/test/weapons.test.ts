import { describe, expect, it } from 'vitest';
import {
  allCells,
  applyAction,
  type Board,
  botViewFromPublic,
  createBot,
  createRng,
  type GameState,
  getPublicView,
  key,
  patternCells,
  POWER_UP_IDS,
  randomWeaponAction,
  type ShotEvent,
  torpedoLane,
  weaponMaxUses,
  WEAPONS,
} from '../src/shared/engine';
import { battleGame, must } from './helpers';

// rowFleet: carrier row 0 (x 0-4), battleship row 2 (x 0-3), cruiser row 4, submarine row 6 (x 0-2), destroyer row 8 (x 0-1).

function withCharge(s: GameState, charge = 100): GameState {
  return { ...s, players: [{ ...s.players[0], charge }, s.players[1]] };
}

function withDefender(s: GameState, patch: Partial<Board>): GameState {
  return { ...s, players: [s.players[0], { ...s.players[1], board: { ...s.players[1].board, ...patch } }] };
}

const lastShot = (s: GameState): ShotEvent => s.log[s.log.length - 1];
const coords = (cs: { x: number; y: number }[]) => cs.map(key);

describe('airstrike', () => {
  it('hits the drop cell and the next 3 cells up, costs 60 and ends the turn', () => {
    const s = withCharge(battleGame(), 60);
    const r = must(applyAction(s, { type: 'USE_WEAPON', player: 0, weaponId: 'airstrike', target: { x: 0, y: 3 } }));
    const ev = lastShot(r.state);
    expect(coords(ev.results.map((x) => x.coord))).toEqual(['0,3', '0,2', '0,1', '0,0']);
    expect(ev.results.map((x) => x.result)).toEqual(['miss', 'hit', 'miss', 'hit']);
    expect(r.state.players[0].charge).toBe(0);
    expect(r.state.players[0].weaponUses.airstrike).toBe(1);
    expect(r.state.activePlayer).toBe(1);
  });

  it('stops at the top edge and skips rocks', () => {
    const edge = lastShot(must(applyAction(withCharge(battleGame()), { type: 'USE_WEAPON', player: 0, weaponId: 'airstrike', target: { x: 5, y: 1 } })).state);
    expect(coords(edge.results.map((x) => x.coord))).toEqual(['5,1', '5,0']);
    expect(coords(patternCells(WEAPONS.airstrike, { x: 9, y: 0 }, { width: 10, height: 10 }))).toEqual(['9,0']);
    const s = withCharge(withDefender(battleGame(), { obstacles: { '0,2': 'rock' } }));
    const ev = lastShot(must(applyAction(s, { type: 'USE_WEAPON', player: 0, weaponId: 'airstrike', target: { x: 0, y: 3 } })).state);
    expect(coords(ev.results.map((x) => x.coord))).toEqual(['0,3', '0,1', '0,0']);
  });

  it('is limited to 2 uses', () => {
    const base = battleGame();
    const s: GameState = { ...base, players: [{ ...base.players[0], charge: 100, weaponUses: { airstrike: 2 } }, base.players[1]] };
    expect(applyAction(s, { type: 'USE_WEAPON', player: 0, weaponId: 'airstrike', target: { x: 5, y: 5 } }).error).toBe('WEAPON_NOT_READY');
  });

  it('gets a third use on 13×13 and bigger boards', () => {
    const base = battleGame({ grid: { width: 13, height: 13 } });
    const s: GameState = { ...base, players: [{ ...base.players[0], charge: 100, weaponUses: { airstrike: 2 } }, base.players[1]] };
    const r = must(applyAction(s, { type: 'USE_WEAPON', player: 0, weaponId: 'airstrike', target: { x: 5, y: 5 } }));
    expect(r.state.players[0].weaponUses.airstrike).toBe(3);
    const third: GameState = { ...s, players: [{ ...s.players[0], weaponUses: { airstrike: 3 } }, s.players[1]] };
    expect(applyAction(third, { type: 'USE_WEAPON', player: 0, weaponId: 'airstrike', target: { x: 5, y: 5 } }).error).toBe('WEAPON_NOT_READY');
    expect(weaponMaxUses(WEAPONS.torpedo, base.rules)).toBe(3);
    expect(weaponMaxUses(WEAPONS.torpedo, battleGame({ grid: { width: 12, height: 12 } }).rules)).toBe(2);
    expect(weaponMaxUses(WEAPONS.sonar, base.rules)).toBeNull();
  });
});

describe('barrage', () => {
  it('fires 4 shots at distinct unrevealed cells', () => {
    const s = withCharge(battleGame(), 70);
    const r = must(applyAction(s, { type: 'USE_WEAPON', player: 0, weaponId: 'barrage', target: { x: 0, y: 0 } }));
    const ev = lastShot(r.state);
    expect(ev.results).toHaveLength(4);
    expect(new Set(coords(ev.results.map((x) => x.coord))).size).toBe(4);
    expect(r.state.players[0].charge).toBe(0);
    expect(r.state.players[0].shotsFired).toBe(4);
    expect(r.state.activePlayer).toBe(1);
  });

  it('is deterministic for the same state', () => {
    const s = withCharge(battleGame());
    const a = must(applyAction(s, { type: 'USE_WEAPON', player: 0, weaponId: 'barrage', target: { x: 0, y: 0 } }));
    const b = must(applyAction(s, { type: 'USE_WEAPON', player: 0, weaponId: 'barrage', target: { x: 9, y: 9 } }));
    expect(lastShot(a.state).results).toEqual(lastShot(b.state).results);
  });

  it('never picks fired cells or visible reefs, and fires fewer when few cells remain', () => {
    const base = battleGame();
    const shots: Board['shots'] = {};
    for (const c of allCells(base.players[1].board)) shots[key(c)] = 'miss';
    delete shots['9,9'];
    delete shots['9,7'];
    delete shots['5,5'];
    const s = withCharge(withDefender(base, { shots, obstacles: { '5,5': 'reef' } }));
    const ev = lastShot(must(applyAction(s, { type: 'USE_WEAPON', player: 0, weaponId: 'barrage', target: { x: 0, y: 0 } })).state);
    expect(coords(ev.results.map((x) => x.coord)).sort()).toEqual(['9,7', '9,9']);
  });

  it('rejects a board with nothing left to hit', () => {
    const base = battleGame();
    const shots: Board['shots'] = {};
    for (const c of allCells(base.players[1].board)) shots[key(c)] = 'miss';
    delete shots['5,5'];
    const s = withCharge(withDefender(base, { shots, obstacles: { '5,5': 'reef' } }));
    expect(applyAction(s, { type: 'USE_WEAPON', player: 0, weaponId: 'barrage', target: { x: 0, y: 0 } }).error).toBe('ALREADY_FIRED');
  });

  it('a barrage shell on a mine costs the next turn', () => {
    const base = battleGame({ bonusShotOnHit: false });
    const shots: Board['shots'] = {};
    for (const c of allCells(base.players[1].board)) shots[key(c)] = 'miss';
    delete shots['5,5'];
    const s = withCharge(withDefender(base, { shots, obstacles: { '5,5': 'mine' } }));
    const r = must(applyAction(s, { type: 'USE_WEAPON', player: 0, weaponId: 'barrage', target: { x: 0, y: 0 } }));
    expect(lastShot(r.state).mineTriggered).toBe(true);
    expect(r.state.players[0].skipNextTurn).toBe(true);
  });
});

describe('torpedo', () => {
  const fire = (s: GameState, target: { x: number; y: number }) =>
    applyAction(withCharge(s), { type: 'USE_WEAPON', player: 0, weaponId: 'torpedo', target });
  /** rowFleet moved 5 columns right, so every row starts with open water. */
  const shifted = (s: GameState) =>
    withDefender(s, {
      ships: s.players[1].board.ships.map((ship) => ({
        ...ship,
        origin: { x: ship.origin.x + 5, y: ship.origin.y },
        cells: ship.cells.map((c) => ({ x: c.x + 5, y: c.y })),
      })),
    });

  it('runs right from the drop cell, marks water empty and hits the first ship', () => {
    const r = must(fire(shifted(battleGame()), { x: 1, y: 0 }));
    const ev = lastShot(r.state);
    expect(ev.results).toHaveLength(1);
    expect(ev.results[0]).toMatchObject({ coord: { x: 5, y: 0 }, result: 'hit' });
    expect(coords(ev.knownEmpty!)).toEqual(['1,0', '2,0', '3,0', '4,0']);
    expect(coords(ev.path!)).toEqual(['1,0', '2,0', '3,0', '4,0', '5,0']);
    expect(r.state.players[1].board.shots['3,0']).toBe('knownEmpty');
    expect(r.state.players[1].board.shots['0,0']).toBeUndefined();
    expect(r.state.players[0].charge).toBe(100 - WEAPONS.torpedo.cost);
    expect(r.state.activePlayer).toBe(1);
  });

  it('hits a ship on the drop cell itself', () => {
    const ev = lastShot(must(fire(battleGame(), { x: 0, y: 0 })).state);
    expect(ev.results[0]).toMatchObject({ coord: { x: 0, y: 0 }, result: 'hit' });
    expect(coords(ev.path!)).toEqual(['0,0']);
  });

  it('clears the rest of the row when it hits nothing', () => {
    const ev = lastShot(must(fire(battleGame(), { x: 3, y: 1 })).state);
    expect(ev.results).toHaveLength(0);
    expect(coords(ev.knownEmpty!)).toEqual(['3,1', '4,1', '5,1', '6,1', '7,1', '8,1', '9,1']);
    expect(coords(lastShot(must(fire(battleGame(), { x: 9, y: 1 })).state).path!)).toEqual(['9,1']);
  });

  it('stops at rocks and islands', () => {
    const s = withDefender(shifted(battleGame()), { obstacles: { '3,0': 'rock' } });
    const ev = lastShot(must(fire(s, { x: 1, y: 0 })).state);
    expect(ev.results).toHaveLength(0);
    expect(coords(ev.knownEmpty!)).toEqual(['1,0', '2,0']);
    expect(fire(withDefender(battleGame(), { obstacles: { '7,1': 'island' } }), { x: 7, y: 1 }).error).toBe('BLOCKED');
  });

  it('passes over reefs and cells already fired at', () => {
    let s = withDefender(shifted(battleGame({ bonusShotOnHit: false })), { obstacles: { '2,0': 'reef' } });
    s = must(applyAction(s, { type: 'FIRE', player: 0, target: { x: 5, y: 0 } })).state;
    s = must(applyAction(s, { type: 'FIRE', player: 1, target: { x: 9, y: 9 } })).state;
    const r = must(fire(s, { x: 1, y: 0 }));
    const ev = lastShot(r.state);
    expect(ev.results[0]).toMatchObject({ coord: { x: 6, y: 0 }, result: 'hit' });
    expect(coords(ev.knownEmpty!)).toEqual(['1,0', '3,0', '4,0']);
    expect(r.state.players[1].board.shots['2,0']).toBeUndefined();
  });

  it('detonates a mine without costing a turn', () => {
    const s = withDefender(battleGame(), { obstacles: { '6,0': 'mine' } });
    const r = must(fire(s, { x: 5, y: 0 }));
    const ev = lastShot(r.state);
    expect(ev.results[0]).toMatchObject({ coord: { x: 6, y: 0 }, result: 'miss', obstacle: 'mine' });
    expect(ev.mineTriggered).toBeUndefined();
    expect(r.state.players[0].skipNextTurn).toBeFalsy();
    expect(r.state.activePlayer).toBe(1);
    expect(getPublicView(r.state, 0).enemyBoard.obstacles?.['6,0']).toBe('mine');
  });

  it('rejects a lane with nothing left to reveal', () => {
    let s = battleGame({ bonusShotOnHit: false });
    for (let x = 0; x < 10; x++) {
      s = must(applyAction(s, { type: 'FIRE', player: 0, target: { x, y: 1 } })).state;
      s = must(applyAction(s, { type: 'FIRE', player: 1, target: { x, y: 9 } })).state;
    }
    expect(fire(s, { x: 0, y: 1 }).error).toBe('ALREADY_FIRED');
  });

  it('lane helper runs right from the drop cell and stops before solid obstacles', () => {
    const board = { width: 10, height: 10, shots: {}, obstacles: { '4,2': 'island' as const } };
    expect(coords(torpedoLane(board, { x: 1, y: 2 }))).toEqual(['1,2', '2,2', '3,2']);
    expect(torpedoLane(board, { x: 5, y: 2 })).toHaveLength(5);
    expect(torpedoLane(board, { x: 4, y: 2 })).toHaveLength(0);
  });
});

describe('bots and the new weapons', () => {
  it('random weapon actions are always legal', () => {
    for (const id of POWER_UP_IDS) {
      for (let seed = 1; seed <= 20; seed++) {
        const s = withCharge(battleGame());
        const action = randomWeaponAction(botViewFromPublic(getPublicView(s, 0)), WEAPONS[id], createRng(seed));
        expect(action).not.toBeNull();
        if (action?.type !== 'USE_WEAPON') continue;
        must(applyAction(s, { type: 'USE_WEAPON', player: 0, weaponId: action.weaponId, target: action.target }));
      }
    }
  });

  it('every difficulty fires every new weapon legally over many games', () => {
    const used = new Set<string>();
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      for (let seed = 1; seed <= 12; seed++) {
        let s = battleGame();
        const bots = [createBot(difficulty, s.rules, createRng(seed)), createBot(difficulty, s.rules, createRng(seed + 100))];
        let guard = 0;
        while (s.phase === 'battle' && guard++ < 400) {
          const p = s.activePlayer;
          const a = bots[p].chooseAction(botViewFromPublic(getPublicView(s, p)));
          if (a.type === 'USE_WEAPON') used.add(`${difficulty}:${a.weaponId}`);
          s = must(
            a.type === 'FIRE'
              ? applyAction(s, { type: 'FIRE', player: p, target: a.target })
              : applyAction(s, { type: 'USE_WEAPON', player: p, weaponId: a.weaponId, target: a.target }),
          ).state;
        }
        expect(s.phase).toBe('finished');
      }
    }
    for (const id of ['barrage', 'torpedo', 'airstrike']) {
      expect(used.has(`easy:${id}`) || used.has(`medium:${id}`) || used.has(`hard:${id}`)).toBe(true);
    }
  }, 60_000);
});

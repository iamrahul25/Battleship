import { describe, expect, it } from 'vitest';
import {
  applyAction,
  BOARD_SIZE_MAX,
  BOARD_SIZE_MIN,
  boardRules,
  botViewFromPublic,
  createBoard,
  createGame,
  createRng,
  createRules,
  generateObstacles,
  getPublicView,
  key,
  legalTargets,
  makePlacedShip,
  mineCells,
  neighbours4,
  type ObstacleKind,
  obstacleCounts,
  OBSTACLE_LEVELS,
  parseKey,
  placementError,
  type PlayerIndex,
  randomFleet,
  randomMines,
  type RuleSet,
  terrainOnly,
  validateFleet,
  withMines,
} from '../src/shared/engine';
import { simulateGame } from '../scripts/simulate';
import { must, rowFleet } from './helpers';

/** Battle-phase game where player 1's board (the one player 0 fires at) has the given obstacles. */
function gameWithObstacles(obstacles: Record<string, ObstacleKind>, overrides: Partial<RuleSet> = {}) {
  const rules = createRules({ bonusShotOnHit: false, ...overrides });
  let s = createGame(rules, 1);
  s = { ...s, players: [s.players[0], { ...s.players[1], board: { ...s.players[1].board, obstacles } }] };
  for (const p of [0, 1] as PlayerIndex[]) {
    s = must(applyAction(s, { type: 'PLACE_FLEET', player: p, ships: rowFleet(rules) })).state;
    s = must(applyAction(s, { type: 'READY', player: p })).state;
  }
  return { ...s, activePlayer: 0 as PlayerIndex };
}

const ROCK = { x: 9, y: 0 };
const REEF = { x: 9, y: 2 };
const MINE = { x: 9, y: 4 };
const OBSTACLES: Record<string, ObstacleKind> = { [key(ROCK)]: 'rock', [key(REEF)]: 'reef', [key(MINE)]: 'mine', '8,6': 'island', '9,6': 'island' };

describe('obstacle generation', () => {
  it('none means no obstacles and an unchanged RNG stream', () => {
    const rules = createRules();
    expect(obstacleCounts(rules)).toEqual({ rock: 0, island: 0, reef: 0, mine: 0 });
    const g = createGame(rules, 42);
    expect(g.players[0].board.obstacles).toBeUndefined();
    expect(g.rngState).toBe(42);
  });

  it('few < many, scaled by board area', () => {
    const total = (n: number, level: 'few' | 'many') =>
      Object.values(obstacleCounts({ grid: { width: n, height: n }, obstacles: level })).reduce((a, b) => a + b, 0);
    expect(total(10, 'few')).toBeLessThan(total(10, 'many'));
    expect(total(7, 'many')).toBeLessThan(total(15, 'many'));
    expect(total(7, 'few')).toBeGreaterThanOrEqual(4);
  });

  it('every kind appears with the right count; islands are connected 2–3 cell clusters', () => {
    for (const level of ['few', 'many'] as const) {
      for (let seed = 0; seed < 50; seed++) {
        const rules = createRules({ obstacles: level });
        const obs = generateObstacles(rules, createRng(seed));
        const counts = obstacleCounts(rules);
        const cells = (kind: ObstacleKind) => Object.keys(obs).filter((k) => obs[k] === kind).map(parseKey);
        expect(cells('rock')).toHaveLength(counts.rock);
        expect(cells('reef')).toHaveLength(counts.reef);
        expect(cells('mine')).toHaveLength(counts.mine);
        const islands = cells('island');
        expect(islands.length).toBeGreaterThanOrEqual(counts.island * 2);
        expect(islands.length).toBeLessThanOrEqual(counts.island * 3);
        for (const c of islands) {
          expect(neighbours4(rules.grid, c).some((n) => obs[key(n)] === 'island')).toBe(true);
        }
      }
    }
  });

  it('both boards get obstacles with the same counts per kind', () => {
    const g = createGame(createRules({ obstacles: 'many' }), 7);
    const tally = (p: 0 | 1) => {
      const kinds = Object.values(g.players[p].board.obstacles ?? {});
      return { rock: kinds.filter((k) => k === 'rock').length, reef: kinds.filter((k) => k === 'reef').length, mine: kinds.filter((k) => k === 'mine').length };
    };
    expect(tally(0)).toEqual(tally(1));
    expect(tally(0).mine).toBeGreaterThan(0);
  });

  it('random fleets fit around obstacles on every size, mode and density', () => {
    for (let n = BOARD_SIZE_MIN; n <= BOARD_SIZE_MAX; n++) {
      for (const mode of ['classic', 'advance'] as const) {
        for (const obstacles of OBSTACLE_LEVELS) {
          const rules = createRules({ ...boardRules(n, mode), obstacles });
          for (let seed = 0; seed < 15; seed++) {
            const obs = generateObstacles(rules, createRng(seed));
            const ships = randomFleet(rules, createRng(seed + 1000), { obstacles: obs });
            for (const s of ships) for (const c of s.cells) expect(obs[key(c)]).toBeUndefined();
            const input = ships.map((s) => ({ defId: s.defId, origin: s.origin, rotation: s.rotation }));
            expect(validateFleet(rules, input, obs).ok).toBe(true);
          }
        }
      }
    }
  });
});

describe('placement around obstacles', () => {
  it('ships cannot sit on any obstacle, but may touch one', () => {
    const rules = createRules();
    const destroyer = rules.fleet.find((d) => d.id === 'destroyer')!;
    const board = { ...createBoard(10, 10), obstacles: { '3,3': 'reef' as const } };
    expect(placementError(board, destroyer, { x: 2, y: 3 }, 0, rules)).toBe('OBSTACLE');
    expect(placementError(board, destroyer, { x: 4, y: 3 }, 0, rules)).toBeNull();
    expect(placementError(board, destroyer, { x: 3, y: 4 }, 90, rules)).toBeNull();
  });

  it('PLACE_FLEET rejects a fleet overlapping the player’s obstacles and keeps them on the board', () => {
    const rules = createRules();
    let s = createGame(rules, 1);
    s = { ...s, players: [{ ...s.players[0], board: { ...s.players[0].board, obstacles: { '0,0': 'rock' } } }, s.players[1]] };
    expect(applyAction(s, { type: 'PLACE_FLEET', player: 0, ships: rowFleet(rules) }).error).toBe('INVALID_PLACEMENT');
    const moved = rowFleet(rules).map((sh) => makePlacedShip(rules.fleet.find((d) => d.id === sh.defId)!, Number(sh.uid.split('#')[1]), { x: 5, y: sh.origin.y }, 0));
    const placed = must(applyAction(s, { type: 'PLACE_FLEET', player: 0, ships: moved })).state;
    expect(placed.players[0].board.obstacles).toEqual({ '0,0': 'rock' });
  });
});

describe('player-placed mines', () => {
  const rules = createRules();
  const shifted = () =>
    rowFleet(rules).map((sh) => makePlacedShip(rules.fleet.find((d) => d.id === sh.defId)!, Number(sh.uid.split('#')[1]), { x: 5, y: sh.origin.y }, 0));
  const withObstacles = (obstacles: Record<string, ObstacleKind>) => {
    const s = createGame(rules, 1);
    return { ...s, players: [{ ...s.players[0], board: { ...s.players[0].board, obstacles } }, s.players[1]] as typeof s.players };
  };

  it('PLACE_FLEET moves the mines and keeps the terrain', () => {
    const s = withObstacles({ '0,0': 'rock', '9,9': 'mine', '9,8': 'mine' });
    const placed = must(applyAction(s, { type: 'PLACE_FLEET', player: 0, ships: shifted(), mines: [{ x: 1, y: 1 }, { x: 2, y: 9 }] })).state;
    expect(placed.players[0].board.obstacles).toEqual({ '0,0': 'rock', '1,1': 'mine', '2,9': 'mine' });
  });

  it('rejects mines that change the count, repeat, leave the grid, or sit on terrain or ships', () => {
    const s = withObstacles({ '0,0': 'rock', '9,9': 'mine', '9,8': 'mine' });
    const place = (mines: { x: number; y: number }[]) => applyAction(s, { type: 'PLACE_FLEET', player: 0, ships: shifted(), mines }).error;
    expect(place([{ x: 1, y: 1 }])).toBe('INVALID_PLACEMENT');
    expect(place([{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }])).toBe('INVALID_PLACEMENT');
    expect(place([{ x: 1, y: 1 }, { x: 1, y: 1 }])).toBe('INVALID_PLACEMENT');
    expect(place([{ x: 1, y: 1 }, { x: 10, y: 1 }])).toBe('INVALID_PLACEMENT');
    expect(place([{ x: 1, y: 1 }, { x: 0, y: 0 }])).toBe('INVALID_PLACEMENT');
    expect(place([{ x: 1, y: 1 }, { x: 5, y: 0 }])).toBe('INVALID_PLACEMENT');
  });

  it('omitting mines keeps the dealt positions', () => {
    const s = withObstacles({ '9,9': 'mine' });
    const placed = must(applyAction(s, { type: 'PLACE_FLEET', player: 0, ships: shifted() })).state;
    expect(placed.players[0].board.obstacles).toEqual({ '9,9': 'mine' });
  });

  it('random mines never land on terrain, ships or each other', () => {
    for (let seed = 0; seed < 30; seed++) {
      const r = createRules({ obstacles: 'many' });
      const obs = generateObstacles(r, createRng(seed));
      const terrain = terrainOnly(obs);
      const ships = randomFleet(r, createRng(seed + 1), { obstacles: terrain });
      const count = mineCells(obs).length;
      const mines = randomMines({ ...createBoard(r.grid.width, r.grid.height), obstacles: terrain, ships }, count, createRng(seed + 2));
      expect(mines).toHaveLength(count);
      expect(new Set(mines.map(key)).size).toBe(count);
      for (const m of mines) {
        expect(terrain[key(m)]).toBeUndefined();
        expect(ships.some((sh) => sh.cells.some((c) => c.x === m.x && c.y === m.y))).toBe(false);
      }
      const input = ships.map((sh) => ({ defId: sh.defId, origin: sh.origin, rotation: sh.rotation }));
      expect(validateFleet(r, input, withMines(terrain, mines)).ok).toBe(true);
    }
  });
});

describe('firing at obstacles', () => {
  it('rocks and islands cannot be targeted', () => {
    const s = gameWithObstacles(OBSTACLES);
    expect(applyAction(s, { type: 'FIRE', player: 0, target: ROCK }).error).toBe('BLOCKED');
    expect(applyAction(s, { type: 'FIRE', player: 0, target: { x: 8, y: 6 } }).error).toBe('BLOCKED');
    const targets = legalTargets(s.players[1].board).map(key);
    expect(targets).not.toContain(key(ROCK));
    expect(targets).toContain(key(REEF));
    expect(targets).toContain(key(MINE));
  });

  it('a reef shot is a plain miss', () => {
    const s = gameWithObstacles(OBSTACLES);
    const r = must(applyAction(s, { type: 'FIRE', player: 0, target: REEF }));
    const shot = r.state.log.at(-1)!;
    expect(shot.results[0]).toMatchObject({ result: 'miss', obstacle: 'reef' });
    expect(shot.mineTriggered).toBeUndefined();
    expect(r.state.activePlayer).toBe(1);
  });

  it('a mine makes the shooter skip their next turn', () => {
    let s = gameWithObstacles(OBSTACLES);
    s = must(applyAction(s, { type: 'FIRE', player: 0, target: MINE })).state;
    expect(s.log.at(-1)!.mineTriggered).toBe(true);
    expect(s.activePlayer).toBe(1);
    expect(s.players[0].skipNextTurn).toBe(true);

    s = must(applyAction(s, { type: 'FIRE', player: 1, target: { x: 9, y: 9 } })).state;
    expect(s.log.at(-1)!.turnSkipped).toBe(0);
    expect(s.activePlayer).toBe(1);
    expect(s.players[0].skipNextTurn).toBe(false);

    s = must(applyAction(s, { type: 'FIRE', player: 1, target: { x: 9, y: 8 } })).state;
    expect(s.log.at(-1)!.turnSkipped).toBeUndefined();
    expect(s.activePlayer).toBe(0);
  });

  it('artillery skips rocks and still triggers mines', () => {
    let s = gameWithObstacles({ ...OBSTACLES, '9,5': 'rock' }, { powerUpsEnabled: true });
    s = { ...s, players: [{ ...s.players[0], charge: 100 }, s.players[1]] };
    s = must(applyAction(s, { type: 'USE_WEAPON', player: 0, weaponId: 'artillery', target: { x: 9, y: 4 } })).state;
    const shot = s.log.at(-1)!;
    expect(shot.mineTriggered).toBe(true);
    expect(shot.results.map((r) => key(r.coord)).sort()).toEqual(['8,4', '9,3', '9,4']);
    expect(s.players[0].skipNextTurn).toBe(true);
  });

  it('auto-fire on timeout never targets rocks or islands', () => {
    for (let seed = 0; seed < 40; seed++) {
      let s = gameWithObstacles(OBSTACLES);
      s = { ...s, rngState: seed };
      s = must(applyAction(s, { type: 'TIMEOUT', player: 0 })).state;
      const target = s.log.at(-1)!.target;
      expect(['rock', 'island']).not.toContain(OBSTACLES[key(target)]);
    }
  });
});

describe('obstacle visibility', () => {
  it('the enemy sees rocks, islands and reefs but not mines until one is hit', () => {
    let s = gameWithObstacles(OBSTACLES);
    let seen = getPublicView(s, 0).enemyBoard.obstacles ?? {};
    expect(seen[key(ROCK)]).toBe('rock');
    expect(seen[key(REEF)]).toBe('reef');
    expect(seen['8,6']).toBe('island');
    expect(seen[key(MINE)]).toBeUndefined();
    expect(JSON.stringify(getPublicView(s, 0))).not.toContain('mine');
    expect(getPublicView(s, 1).myBoard.obstacles?.[key(MINE)]).toBe('mine');

    s = must(applyAction(s, { type: 'FIRE', player: 0, target: MINE })).state;
    seen = getPublicView(s, 0).enemyBoard.obstacles ?? {};
    expect(seen[key(MINE)]).toBe('mine');
  });

  it('all mines are revealed once the game ends', () => {
    let s = gameWithObstacles(OBSTACLES);
    s = must(applyAction(s, { type: 'FORFEIT', player: 1 })).state;
    expect(getPublicView(s, 0).enemyBoard.obstacles?.[key(MINE)]).toBe('mine');
  });

  it('bots see visible obstacles as water and never pick them', () => {
    const s = gameWithObstacles(OBSTACLES);
    const view = botViewFromPublic(getPublicView(s, 0));
    expect(view.target.shots[key(ROCK)]).toBe('knownEmpty');
    expect(view.target.shots[key(REEF)]).toBe('knownEmpty');
    expect(view.target.shots[key(MINE)]).toBeUndefined();
  });
});

describe('bots with obstacles', () => {
  it.each(['easy', 'medium', 'hard'] as const)('%s plays legal games with many obstacles', (d) => {
    for (const n of [7, 10, 15]) {
      for (const mode of ['classic', 'advance'] as const) {
        const rules = createRules({ ...boardRules(n, mode), obstacles: 'many', powerUpsEnabled: mode === 'advance' });
        expect(simulateGame(d, n * 3 + (mode === 'advance' ? 1 : 0), rules).illegal).toBe(0);
      }
    }
  });
});

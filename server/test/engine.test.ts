import { describe, expect, it } from 'vitest';
import {
  allCells,
  applyAction,
  BOARD_SIZE_MAX,
  BOARD_SIZE_MIN,
  boardRules,
  canPlace,
  CLASSIC_FLEET,
  cellAt,
  coordLabel,
  createBoard,
  createGame,
  createRng,
  createRules,
  fleetForSize,
  FleetPresets,
  getPublicView,
  GridPresets,
  isFleetSunk,
  isStraightShip,
  key,
  legalTargets,
  makePlacedShip,
  neighbours4,
  neighbours8,
  parseKey,
  patternCells,
  placeShip,
  placementError,
  randomFleet,
  removeShip,
  resolveShot,
  resolveSonar,
  rulesForMode,
  shapeCells,
  SHAPED_SHIPS,
  totalShipCells,
  totalShips,
  uniqueRotations,
  validateFleet,
  WEAPONS,
  type GameState,
  type PlacedShip,
} from '../src/shared/engine';
import { battleGame, must, rowFleet } from './helpers';

const rules = createRules();
const carrier = rules.fleet.find((d) => d.id === 'carrier')!;
const destroyer = rules.fleet.find((d) => d.id === 'destroyer')!;

describe('config', () => {
  it('classic fleet has 5 ships / 17 cells', () => {
    expect(totalShips(rules)).toBe(5);
    expect(totalShipCells(rules)).toBe(17);
  });
  it('fleet scales with board size', () => {
    expect(fleetForSize(10)).toBe(CLASSIC_FLEET);
    expect(boardRules(3).grid).toEqual({ width: BOARD_SIZE_MIN, height: BOARD_SIZE_MIN });
    expect(boardRules(99).grid).toEqual({ width: BOARD_SIZE_MAX, height: BOARD_SIZE_MAX });
    for (const mode of ['classic', 'arsenal'] as const) {
      let prevShips = 0;
      for (let n = BOARD_SIZE_MIN; n <= BOARD_SIZE_MAX; n++) {
        const r = createRules(boardRules(n, mode));
        const density = totalShipCells(r) / (n * n);
        expect(density).toBeGreaterThan(0.14);
        expect(density).toBeLessThan(mode === 'classic' ? 0.2 : 0.21);
        expect(totalShips(r)).toBeGreaterThanOrEqual(prevShips);
        prevShips = totalShips(r);
      }
    }
  });
  it('classic fleets are straight; arsenal mixes in T, L and Z ships', () => {
    for (let n = BOARD_SIZE_MIN; n <= BOARD_SIZE_MAX; n++) {
      expect(fleetForSize(n).every(isStraightShip)).toBe(true);
      const ids = fleetForSize(n, 'arsenal').map((d) => d.id);
      expect(ids).toContain(SHAPED_SHIPS.T.id);
      if (n >= 9) for (const s of Object.values(SHAPED_SHIPS)) expect(ids).toContain(s.id);
    }
    for (const s of Object.values(SHAPED_SHIPS)) {
      expect(isStraightShip(s)).toBe(false);
      expect(uniqueRotations(s)).toHaveLength(s.id === SHAPED_SHIPS.Z.id ? 2 : 4);
    }
  });
  it('validateFleet accepts shaped ships in every rotation', () => {
    const r = createRules(boardRules(10, 'arsenal'));
    for (let seed = 0; seed < 300; seed++) {
      const ships = randomFleet(r, createRng(seed));
      const input = ships.map((s) => ({ defId: s.defId, origin: s.origin, rotation: s.rotation }));
      const v = validateFleet(r, input);
      expect(v.ok).toBe(true);
      if (v.ok) expect(v.ships.map((s) => s.cells)).toEqual(ships.map((s) => s.cells));
    }
    const rotations = new Set<number>();
    for (let seed = 0; seed < 300; seed++)
      for (const s of randomFleet(r, createRng(seed))) if (s.defId === SHAPED_SHIPS.T.id) rotations.add(s.rotation);
    expect([...rotations].sort()).toEqual([0, 180, 270, 90]);
  });
  it('modes toggle power-ups', () => {
    expect(rulesForMode('classic').powerUpsEnabled).toBe(false);
    expect(rulesForMode('arsenal').powerUpsEnabled).toBe(true);
  });
  it('default rules: bonus shot on hit, no touching', () => {
    expect(rules.bonusShotOnHit).toBe(true);
    expect(rules.allowTouching).toBe(false);
  });
});

describe('board', () => {
  it('keys round-trip', () => {
    expect(parseKey(key({ x: 3, y: 7 }))).toEqual({ x: 3, y: 7 });
  });
  it('neighbours clip at edges', () => {
    const b = createBoard(10, 10);
    expect(neighbours4(b, { x: 0, y: 0 })).toHaveLength(2);
    expect(neighbours8(b, { x: 0, y: 0 })).toHaveLength(3);
    expect(neighbours8(b, { x: 5, y: 5 })).toHaveLength(8);
  });
  it('labels', () => {
    expect(coordLabel({ x: 0, y: 0 })).toBe('A1');
    expect(coordLabel({ x: 9, y: 9 })).toBe('J10');
  });
  it('legal targets shrink after shots', () => {
    const b = createBoard(10, 10);
    expect(legalTargets(b)).toHaveLength(100);
    b.shots[key({ x: 1, y: 1 })] = 'miss';
    expect(legalTargets(b)).toHaveLength(99);
  });
});

describe('placement', () => {
  it('rotations of a straight ship are H and V', () => {
    expect(uniqueRotations(carrier)).toEqual([0, 90]);
    expect(shapeCells(carrier, 90)).toEqual([0, 1, 2, 3, 4].map((y) => ({ x: 0, y })));
  });
  it('supports non-line shapes (future ships)', () => {
    const lShape = { cells: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }] };
    expect(uniqueRotations(lShape)).toHaveLength(4);
    const square = { cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }] };
    expect(uniqueRotations(square)).toHaveLength(1);
  });
  it('rejects out of bounds, overlap and touching', () => {
    let b = createBoard(10, 10);
    expect(placementError(b, carrier, { x: 6, y: 0 }, 0, rules)).toBe('OUT_OF_BOUNDS');
    expect(placementError(b, carrier, { x: 0, y: 6 }, 90, rules)).toBe('OUT_OF_BOUNDS');
    b = placeShip(b, makePlacedShip(carrier, 0, { x: 0, y: 0 }, 0));
    expect(placementError(b, destroyer, { x: 2, y: 0 }, 90, rules)).toBe('OVERLAP');
    expect(placementError(b, destroyer, { x: 0, y: 1 }, 0, rules)).toBe('TOUCHING');
    expect(placementError(b, destroyer, { x: 5, y: 1 }, 0, rules)).toBe('TOUCHING'); // diagonal
    expect(canPlace(b, destroyer, { x: 0, y: 2 }, 0, rules)).toBe(true);
    expect(canPlace(b, destroyer, { x: 0, y: 1 }, 0, { ...rules, allowTouching: true })).toBe(true);
  });
  it('ignoreUid allows moving a ship onto its own spot', () => {
    const ship = makePlacedShip(carrier, 0, { x: 0, y: 0 }, 0);
    const b = placeShip(createBoard(10, 10), ship);
    expect(canPlace(b, carrier, { x: 1, y: 0 }, 0, rules, ship.uid)).toBe(true);
    expect(removeShip(b, ship.uid).ships).toHaveLength(0);
  });
  it('validateFleet rebuilds cells and checks composition', () => {
    const fleet = rowFleet();
    const v = validateFleet(rules, fleet.map((s) => ({ defId: s.defId, origin: s.origin, rotation: s.rotation })));
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.ships.map((s) => s.cells.length).sort()).toEqual([2, 3, 3, 4, 5]);
    expect(validateFleet(rules, fleet.slice(1).map((s) => ({ defId: s.defId, origin: s.origin, rotation: s.rotation }))).ok).toBe(false);
    expect(validateFleet(rules, [{ defId: 'nope', origin: { x: 0, y: 0 }, rotation: 0 }]).ok).toBe(false);
    const dup = fleet.map((s) => ({ defId: s.defId, origin: s.origin, rotation: s.rotation }));
    dup.push({ defId: 'destroyer', origin: { x: 8, y: 8 }, rotation: 0 });
    expect(validateFleet(rules, dup).ok).toBe(false);
    const bad = fleet.map((s) => ({ defId: s.defId, origin: s.origin, rotation: s.rotation }));
    bad[1] = { ...bad[1], origin: { x: 0, y: 1 } };
    expect(validateFleet(rules, bad).ok).toBe(false);
  });
  it('randomFleet is always valid (property test, 10k seeds)', () => {
    for (let seed = 0; seed < 10_000; seed++) {
      const ships = randomFleet(rules, createRng(seed));
      const v = validateFleet(rules, ships.map((s) => ({ defId: s.defId, origin: s.origin, rotation: s.rotation })));
      expect(v.ok).toBe(true);
    }
  });
  it('randomFleet works for every grid preset', () => {
    for (const id of Object.keys(GridPresets) as (keyof typeof GridPresets)[]) {
      const r = createRules({ grid: GridPresets[id], fleet: FleetPresets[id] });
      for (let seed = 0; seed < 50; seed++) {
        const ships = randomFleet(r, createRng(seed));
        expect(validateFleet(r, ships.map((s) => ({ defId: s.defId, origin: s.origin, rotation: s.rotation }))).ok).toBe(true);
      }
    }
  });
  it('randomFleet works for every board size, touching or not', () => {
    for (let n = BOARD_SIZE_MIN; n <= BOARD_SIZE_MAX; n++) {
      for (const [allowTouching, mode] of [
        [false, 'classic'],
        [true, 'classic'],
        [false, 'arsenal'],
        [true, 'arsenal'],
      ] as const) {
        const r = createRules({ ...boardRules(n, mode), allowTouching });
        for (let seed = 0; seed < 50; seed++) {
          const ships = randomFleet(r, createRng(seed));
          expect(validateFleet(r, ships.map((s) => ({ defId: s.defId, origin: s.origin, rotation: s.rotation }))).ok).toBe(true);
        }
      }
    }
  });
  it('randomFleet throws when impossible', () => {
    const r = createRules({ grid: { width: 3, height: 3 } });
    expect(() => randomFleet(r, createRng(1), { maxAttempts: 3 })).toThrow();
  });
});

describe('attack', () => {
  const base = () => placeShip(createBoard(10, 10), makePlacedShip(destroyer, 0, { x: 4, y: 4 }, 0));
  it('miss, hit, sunk with known-empty halo', () => {
    let b = base();
    let r = resolveShot(b, { x: 0, y: 0 }, rules);
    expect(r.result.result).toBe('miss');
    b = r.board;
    r = resolveShot(b, { x: 4, y: 4 }, rules);
    expect(r.result.result).toBe('hit');
    expect(r.result.ship).toBeUndefined();
    b = r.board;
    r = resolveShot(b, { x: 5, y: 4 }, rules);
    expect(r.result.result).toBe('sunk');
    expect(r.result.ship?.cells).toHaveLength(2);
    expect(cellAt(r.board, { x: 4, y: 4 })).toBe('sunk');
    expect(r.knownEmpty).toHaveLength(10);
    expect(cellAt(r.board, { x: 3, y: 3 })).toBe('knownEmpty');
    expect(isFleetSunk(r.board)).toBe(true);
  });
  it('no halo when touching allowed', () => {
    let b = base();
    b = resolveShot(b, { x: 4, y: 4 }, rules).board;
    const r = resolveShot(b, { x: 5, y: 4 }, { allowTouching: true });
    expect(r.knownEmpty).toHaveLength(0);
  });
  it('does not mutate input', () => {
    const b = base();
    const snapshot = JSON.stringify(b);
    resolveShot(b, { x: 4, y: 4 }, rules);
    expect(JSON.stringify(b)).toBe(snapshot);
  });
  it('sonar counts all ship cells in area', () => {
    const b = base();
    expect(resolveSonar(b, patternCells(WEAPONS.sonar, { x: 4, y: 4 }, b)).shipCellsFound).toBe(2);
    expect(resolveSonar(b, patternCells(WEAPONS.sonar, { x: 0, y: 0 }, b)).shipCellsFound).toBe(0);
    expect(patternCells(WEAPONS.sonar, { x: 0, y: 0 }, b)).toHaveLength(4);
  });
});

describe('game reducer', () => {
  it('starts in placement and requires full fleet to ready', () => {
    const s = createGame(rules, 1);
    expect(s.phase).toBe('placement');
    expect(applyAction(s, { type: 'READY', player: 0 }).error).toBe('FLEET_INCOMPLETE');
    expect(applyAction(s, { type: 'FIRE', player: 0, target: { x: 0, y: 0 } }).error).toBe('WRONG_PHASE');
  });

  it('rejects invalid placement and double ready', () => {
    let s = createGame(rules, 1);
    const bad = rowFleet().map((sh, i) => (i === 1 ? { ...sh, origin: { x: 0, y: 1 } } : sh));
    expect(applyAction(s, { type: 'PLACE_FLEET', player: 0, ships: bad }).error).toBe('INVALID_PLACEMENT');
    s = must(applyAction(s, { type: 'PLACE_FLEET', player: 0, ships: rowFleet() })).state;
    s = must(applyAction(s, { type: 'READY', player: 0 })).state;
    expect(applyAction(s, { type: 'READY', player: 0 }).error).toBe('ALREADY_READY');
    expect(applyAction(s, { type: 'PLACE_FLEET', player: 0, ships: rowFleet() }).error).toBe('ALREADY_READY');
  });

  it('both ready → battle with coin flip, deterministic per seed', () => {
    const run = (seed: number) => {
      let s = createGame(rules, seed);
      for (const p of [0, 1] as const) {
        s = must(applyAction(s, { type: 'PLACE_FLEET', player: p, ships: rowFleet() })).state;
        s = must(applyAction(s, { type: 'READY', player: p })).state;
      }
      return s;
    };
    const a = run(42);
    expect(a.phase).toBe('battle');
    expect(a.turnNumber).toBe(1);
    expect(run(42).activePlayer).toBe(a.activePlayer);
    const firsts = new Set(Array.from({ length: 20 }, (_, i) => run(i).activePlayer));
    expect(firsts.size).toBe(2);
  });

  it('enforces turn, bounds and no double fire', () => {
    const s = battleGame();
    expect(applyAction(s, { type: 'FIRE', player: 1, target: { x: 0, y: 0 } }).error).toBe('NOT_YOUR_TURN');
    expect(applyAction(s, { type: 'FIRE', player: 0, target: { x: 10, y: 0 } }).error).toBe('OUT_OF_BOUNDS');
    const s2 = must(applyAction(s, { type: 'FIRE', player: 0, target: { x: 9, y: 9 } })).state;
    expect(s2.activePlayer).toBe(1);
    const s3 = must(applyAction(s2, { type: 'FIRE', player: 1, target: { x: 9, y: 9 } })).state;
    expect(applyAction(s3, { type: 'FIRE', player: 0, target: { x: 9, y: 9 } }).error).toBe('ALREADY_FIRED');
  });

  it('bonus shot on hit keeps the turn; disabled passes it', () => {
    const s = battleGame();
    const hit = must(applyAction(s, { type: 'FIRE', player: 0, target: { x: 0, y: 0 } }));
    expect(hit.state.activePlayer).toBe(0);
    expect(hit.events[0]).toMatchObject({ type: 'shot', shot: { turnPassed: false } });
    const s2 = battleGame({ bonusShotOnHit: false });
    expect(must(applyAction(s2, { type: 'FIRE', player: 0, target: { x: 0, y: 0 } })).state.activePlayer).toBe(1);
  });

  it('never mutates input state', () => {
    const s = battleGame();
    const snap = JSON.stringify(s);
    applyAction(s, { type: 'FIRE', player: 0, target: { x: 0, y: 0 } });
    applyAction(s, { type: 'TIMEOUT', player: 0 });
    expect(JSON.stringify(s)).toBe(snap);
  });

  it('sinking all ships wins', () => {
    let s: GameState = battleGame();
    const targets = rowFleet().flatMap((sh) => sh.cells);
    let last;
    for (const t of targets) {
      last = must(applyAction(s, { type: 'FIRE', player: 0, target: t }));
      s = last.state;
    }
    expect(s.phase).toBe('finished');
    expect(s.winner).toBe(0);
    expect(s.finishReason).toBe('sunk');
    expect(last!.events.some((e) => e.type === 'gameOver')).toBe(true);
    expect(s.players[0].shipsSunk).toBe(5);
    expect(applyAction(s, { type: 'FIRE', player: 0, target: { x: 9, y: 9 } }).error).toBe('WRONG_PHASE');
    expect(applyAction(s, { type: 'FORFEIT', player: 0 }).error).toBe('WRONG_PHASE');
  });

  it('charge meter: +20 hit, +40 sunk, +10 per 3-miss streak', () => {
    let s = battleGame({ bonusShotOnHit: false });
    s = must(applyAction(s, { type: 'FIRE', player: 0, target: { x: 0, y: 8 } })).state; // destroyer hit
    expect(s.players[0].charge).toBe(20);
    s = must(applyAction(s, { type: 'FIRE', player: 1, target: { x: 9, y: 9 } })).state;
    s = must(applyAction(s, { type: 'FIRE', player: 0, target: { x: 1, y: 8 } })).state; // sunk
    expect(s.players[0].charge).toBe(80);
    let p1 = s;
    for (const x of [9, 8, 7]) {
      p1 = must(applyAction(p1, { type: 'FIRE', player: 1, target: { x, y: 1 } })).state;
      if (x !== 7) p1 = must(applyAction(p1, { type: 'FIRE', player: 0, target: { x, y: 9 } })).state;
    }
    expect(p1.players[1].charge).toBe(10);
  });

  it('classic mode never charges and rejects power-ups', () => {
    let s = battleGame({ powerUpsEnabled: false });
    s = must(applyAction(s, { type: 'FIRE', player: 0, target: { x: 0, y: 0 } })).state;
    expect(s.players[0].charge).toBe(0);
    expect(applyAction(s, { type: 'USE_WEAPON', player: 0, weaponId: 'sonar', target: { x: 5, y: 5 } }).error).toBe(
      'POWERUPS_DISABLED',
    );
  });

  it('heavy artillery: needs charge, hits plus pattern, max 2 uses, ends turn', () => {
    let s = battleGame();
    expect(applyAction(s, { type: 'USE_WEAPON', player: 0, weaponId: 'artillery', target: { x: 1, y: 0 } }).error).toBe(
      'WEAPON_NOT_READY',
    );
    expect(applyAction(s, { type: 'USE_WEAPON', player: 0, weaponId: 'nuke', target: { x: 1, y: 0 } }).error).toBe(
      'WEAPON_UNKNOWN',
    );
    s = { ...s, players: [{ ...s.players[0], charge: 100 }, s.players[1]] };
    const r = must(applyAction(s, { type: 'USE_WEAPON', player: 0, weaponId: 'artillery', target: { x: 1, y: 0 } }));
    const shot = r.events.find((e) => e.type === 'shot')!;
    expect(shot.type === 'shot' && shot.shot.results).toHaveLength(4); // (1,-1) out of bounds
    expect(r.state.players[0].charge).toBe(0);
    expect(r.state.players[0].weaponUses.artillery).toBe(1);
    expect(r.state.activePlayer).toBe(1);
    // artillery hits do not add charge
    const capped = { ...r.state, activePlayer: 0 as const, players: [{ ...r.state.players[0], charge: 100, weaponUses: { artillery: 2 } }, r.state.players[1]] as GameState['players'] };
    expect(applyAction(capped, { type: 'USE_WEAPON', player: 0, weaponId: 'artillery', target: { x: 5, y: 5 } }).error).toBe(
      'WEAPON_NOT_READY',
    );
  });

  it('artillery skips fired cells and rejects fully-fired patterns', () => {
    let s = battleGame({ bonusShotOnHit: false });
    const plus = [{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 4, y: 5 }, { x: 5, y: 6 }, { x: 5, y: 4 }];
    plus.forEach((c, i) => {
      s = must(applyAction(s, { type: 'FIRE', player: 0, target: c })).state;
      s = must(applyAction(s, { type: 'FIRE', player: 1, target: { x: i, y: 9 } })).state;
    });
    s = { ...s, players: [{ ...s.players[0], charge: 100 }, s.players[1]] };
    expect(applyAction(s, { type: 'USE_WEAPON', player: 0, weaponId: 'artillery', target: { x: 5, y: 5 } }).error).toBe(
      'ALREADY_FIRED',
    );
  });

  it('sonar reveals count and ends turn', () => {
    let s = battleGame();
    s = { ...s, players: [{ ...s.players[0], charge: 60 }, s.players[1]] };
    const r = must(applyAction(s, { type: 'USE_WEAPON', player: 0, weaponId: 'sonar', target: { x: 1, y: 1 } }));
    const ev = r.state.log[r.state.log.length - 1];
    expect(ev.sonar?.shipCellsFound).toBe(6); // row 0 (3 cells) + row 2 (3 cells)
    expect(r.state.players[0].charge).toBe(0);
    expect(r.state.activePlayer).toBe(1);
  });

  it('standard weapon id behaves like FIRE', () => {
    const s = battleGame();
    const r = must(applyAction(s, { type: 'USE_WEAPON', player: 0, weaponId: 'standard', target: { x: 9, y: 9 } }));
    expect(r.state.log).toHaveLength(1);
  });

  it('timeouts: auto-shot, 3 in a row forfeits', () => {
    let s = battleGame({ bonusShotOnHit: false });
    for (let i = 0; i < 2; i++) {
      s = must(applyAction(s, { type: 'TIMEOUT', player: 0 })).state;
      expect(s.log[s.log.length - 1].auto).toBe(true);
      expect(s.players[0].consecutiveTimeouts).toBe(i + 1);
      expect(applyAction(s, { type: 'TIMEOUT', player: 0 }).error).toBe('NOT_YOUR_TURN');
      s = must(applyAction(s, { type: 'FIRE', player: 1, target: { x: i, y: 9 } })).state; // row 9 is empty
    }
    s = must(applyAction(s, { type: 'TIMEOUT', player: 0 })).state;
    expect(s.phase).toBe('finished');
    expect(s.winner).toBe(1);
    expect(s.finishReason).toBe('timeout');
  });

  it('a voluntary shot resets the timeout counter', () => {
    let s = battleGame({ bonusShotOnHit: false });
    s = must(applyAction(s, { type: 'TIMEOUT', player: 0 })).state;
    s = { ...s, activePlayer: 0 };
    s = must(applyAction(s, { type: 'FIRE', player: 0, target: legalTargetsFor(s, 0)[0] })).state;
    expect(s.players[0].consecutiveTimeouts).toBe(0);
  });

  it('placement timeout randomizes fleet and readies', () => {
    let s = createGame(rules, 3);
    s = must(applyAction(s, { type: 'TIMEOUT', player: 0 })).state;
    expect(s.players[0].ready).toBe(true);
    expect(s.players[0].board.ships).toHaveLength(5);
    s = must(applyAction(s, { type: 'PLACE_FLEET', player: 1, ships: rowFleet() })).state;
    s = must(applyAction(s, { type: 'TIMEOUT', player: 1 })).state;
    expect(s.players[1].board.ships.map((x) => x.origin)).toEqual(rowFleet().map((x) => x.origin));
    expect(s.phase).toBe('battle');
    expect(applyAction(s, { type: 'TIMEOUT', player: s.activePlayer === 0 ? 1 : 0 }).error).toBe('NOT_YOUR_TURN');
  });

  it('forfeit and disconnect end the game', () => {
    const s = battleGame();
    const f = must(applyAction(s, { type: 'FORFEIT', player: 0 }));
    expect(f.state).toMatchObject({ phase: 'finished', winner: 1, finishReason: 'forfeit' });
    const d = must(applyAction(createGame(rules, 1), { type: 'FORFEIT', player: 1, reason: 'disconnect' }));
    expect(d.state).toMatchObject({ winner: 0, finishReason: 'disconnect' });
  });
});

function legalTargetsFor(s: GameState, attacker: 0 | 1) {
  return legalTargets(s.players[attacker === 0 ? 1 : 0].board);
}

describe('public view redaction', () => {
  it('never exposes unsunk enemy ships', () => {
    let s = battleGame();
    s = must(applyAction(s, { type: 'FIRE', player: 0, target: { x: 0, y: 0 } })).state;
    const v = getPublicView(s, 0);
    expect(v.enemyBoard.ships).toHaveLength(0);
    expect(v.myBoard.ships).toHaveLength(5);
    expect(v.log[0].results[0]).toEqual({ coord: { x: 0, y: 0 }, result: 'hit' });
    expect(JSON.stringify({ enemy: v.enemyBoard, log: v.log })).not.toContain('carrier#0');
    // the defender may see which of their ships was hit
    expect(getPublicView(s, 1).log[0].results[0].shipUid).toBe('carrier#0');
  });

  it('reveals sunk ships, then all ships at game end', () => {
    let s = battleGame();
    for (const t of rowFleet()[4].cells) s = must(applyAction(s, { type: 'FIRE', player: 0, target: t })).state;
    expect(getPublicView(s, 0).enemyBoard.ships.map((x: PlacedShip) => x.defId)).toEqual(['destroyer']);
    expect(getPublicView(s, 1).me.shipsLost).toEqual(['destroyer']);
    s = must(applyAction(s, { type: 'FORFEIT', player: 1 })).state;
    expect(getPublicView(s, 0).enemyBoard.ships).toHaveLength(5);
  });

  it('all cells helper', () => {
    expect(allCells({ width: 3, height: 2 })).toHaveLength(6);
  });
});

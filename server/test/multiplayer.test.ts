import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createGame,
  createRules,
  formatsFor,
  type GameState,
  getPublicView,
  interleavedOrder,
  playersForFormat,
  type RuleSet,
  standings,
  teamsInOrder,
} from '../src/shared/engine';
import { must, rowFleet } from './helpers';

function multiGame(players: number, opts: { teams?: number[]; rules?: Partial<RuleSet> } = {}): GameState {
  const rules = createRules({ bonusShotOnHit: true, ...opts.rules });
  let s = createGame(rules, 7, opts.teams ? { teams: opts.teams } : { players });
  for (let p = 0; p < s.players.length; p++) {
    s = must(applyAction(s, { type: 'PLACE_FLEET', player: p, ships: rowFleet(rules) })).state;
    s = must(applyAction(s, { type: 'READY', player: p })).state;
  }
  return s;
}

/** A water cell in every `rowFleet` layout. */
const WATER = (n: number) => ({ x: 9, y: 9 - n });

/** `shooter` sinks every ship of `defender` (bonus shot keeps the turn on hits). */
function sinkAll(s: GameState, shooter: number, defender: number): GameState {
  for (const ship of s.players[defender].board.ships) {
    for (const c of ship.cells) {
      if (s.phase !== 'battle') return s;
      s = must(applyAction(s, { type: 'FIRE', player: shooter, target: c, targetPlayer: defender })).state;
    }
  }
  return s;
}

describe('seat helpers', () => {
  it('interleaves teams so no team plays twice in a row', () => {
    expect(interleavedOrder([0, 0, 1, 1])).toEqual([0, 2, 1, 3]);
    expect(interleavedOrder([0, 0, 0, 1, 1, 1])).toEqual([0, 3, 1, 4, 2, 5]);
    expect(interleavedOrder([0, 0, 1, 1, 2, 2])).toEqual([0, 2, 4, 1, 3, 5]);
  });

  it('team formats fix the room size', () => {
    expect(playersForFormat('2v2', 6)).toBe(4);
    expect(playersForFormat('3v3', 2)).toBe(6);
    expect(playersForFormat('2v2v2', 3)).toBe(6);
    expect(playersForFormat('ffa', 9)).toBe(6);
    expect(playersForFormat('ffa', 1)).toBe(2);
    expect(formatsFor(4)).toEqual(['ffa', '2v2']);
    expect(formatsFor(6)).toEqual(['ffa', '3v3', '2v2v2']);
    expect(formatsFor(5)).toEqual(['ffa']);
    expect(teamsInOrder('2v2v2', 6)).toEqual([0, 0, 1, 1, 2, 2]);
  });
});

describe('free-for-all (3 players)', () => {
  it('starts only when every seat is ready and rotates turns on misses', () => {
    const rules = createRules();
    let s = createGame(rules, 3, { players: 3 });
    expect(s.players).toHaveLength(3);
    for (const p of [0, 1]) {
      s = must(applyAction(s, { type: 'PLACE_FLEET', player: p, ships: rowFleet(rules) })).state;
      s = must(applyAction(s, { type: 'READY', player: p })).state;
    }
    expect(s.phase).toBe('placement');
    s = must(applyAction(s, { type: 'TIMEOUT', player: 2 })).state;
    expect(s.phase).toBe('battle');

    s = { ...s, activePlayer: 0 };
    s = must(applyAction(s, { type: 'FIRE', player: 0, target: WATER(0), targetPlayer: 2 })).state;
    expect(s.activePlayer).toBe(1);
    expect(s.log.at(-1)!.against).toBe(2);
    s = must(applyAction(s, { type: 'FIRE', player: 1, target: WATER(0) })).state;
    expect(s.log.at(-1)!.against).toBe(0);
    expect(s.activePlayer).toBe(2);
    s = must(applyAction(s, { type: 'FIRE', player: 2, target: WATER(0), targetPlayer: 1 })).state;
    expect(s.activePlayer).toBe(0);
  });

  it('rejects invalid targets', () => {
    const s = { ...multiGame(3), activePlayer: 0 };
    expect(applyAction(s, { type: 'FIRE', player: 0, target: WATER(0), targetPlayer: 0 }).error).toBe('INVALID_TARGET');
    expect(applyAction(s, { type: 'FIRE', player: 0, target: WATER(0), targetPlayer: 5 }).error).toBe('INVALID_TARGET');
  });

  it('a sunk fleet knocks the seat out; the battle goes on until one is left', () => {
    let s = { ...multiGame(3), activePlayer: 0 };
    s = sinkAll(s, 0, 1);
    expect(s.phase).toBe('battle');
    expect(s.players[1].out).toBe('sunk');
    expect(s.eliminated).toEqual([1]);
    expect(s.activePlayer).toBe(0); // last hit keeps the turn
    expect(applyAction(s, { type: 'FIRE', player: 0, target: WATER(0), targetPlayer: 1 }).error).toBe('INVALID_TARGET');

    // Seat 1 is skipped in rotation.
    s = must(applyAction(s, { type: 'FIRE', player: 0, target: WATER(0), targetPlayer: 2 })).state;
    expect(s.activePlayer).toBe(2);
    s = must(applyAction(s, { type: 'FIRE', player: 2, target: WATER(0) })).state;
    expect(s.log.at(-1)!.against).toBe(0);
    expect(s.activePlayer).toBe(0);

    // The knocked-out board is revealed to everyone.
    expect(getPublicView(s, 2).players[1].board.ships).toHaveLength(5);
    expect(getPublicView(s, 2).players[0].board.ships).toHaveLength(0);

    s = sinkAll(s, 0, 2);
    expect(s.phase).toBe('finished');
    expect(s.winner).toBe(0);
    expect(s.winners).toEqual([0]);
    expect(standings(s).map((x) => [x.player, x.rank])).toEqual([
      [0, 1],
      [2, 2],
      [1, 3],
    ]);
    expect(getPublicView(s, 1).standings?.[0]).toMatchObject({ player: 0, rank: 1, out: null });
  });

  it('forfeiting passes the turn and the game continues', () => {
    let s = { ...multiGame(3), activePlayer: 1 };
    s = must(applyAction(s, { type: 'FORFEIT', player: 1 })).state;
    expect(s.phase).toBe('battle');
    expect(s.players[1].out).toBe('forfeit');
    expect(s.activePlayer).toBe(2);
    expect(applyAction(s, { type: 'FORFEIT', player: 1 }).error).toBe('WRONG_PHASE');
    s = must(applyAction(s, { type: 'FORFEIT', player: 0, reason: 'disconnect' })).state;
    expect(s.phase).toBe('finished');
    expect(s.winners).toEqual([2]);
    expect(s.finishReason).toBe('disconnect');
  });

  it('a forfeit during placement lets the others start', () => {
    const rules = createRules();
    let s = createGame(rules, 3, { players: 3 });
    for (const p of [0, 1]) {
      s = must(applyAction(s, { type: 'PLACE_FLEET', player: p, ships: rowFleet(rules) })).state;
      s = must(applyAction(s, { type: 'READY', player: p })).state;
    }
    s = must(applyAction(s, { type: 'FORFEIT', player: 2 })).state;
    expect(s.phase).toBe('battle');
    expect([0, 1]).toContain(s.activePlayer);
  });

  it('three timeouts knock a seat out instead of ending the game', () => {
    let s = { ...multiGame(3), activePlayer: 0 };
    s = { ...s, players: s.players.map((p, i) => (i === 0 ? { ...p, consecutiveTimeouts: 2 } : p)) };
    s = must(applyAction(s, { type: 'TIMEOUT', player: 0 })).state;
    expect(s.players[0].out).toBe('timeout');
    expect(s.phase).toBe('battle');
    expect(s.activePlayer).toBe(1);
  });

  it('auto-fire picks a living enemy', () => {
    let s = { ...multiGame(3), activePlayer: 0 };
    s = must(applyAction(s, { type: 'FORFEIT', player: 1 })).state;
    s = { ...s, activePlayer: 0 };
    s = must(applyAction(s, { type: 'TIMEOUT', player: 0 })).state;
    expect(s.log.at(-1)!.against).toBe(2);
  });

  it('a mine penalty skips the shooter once in rotation', () => {
    let s = multiGame(3, { rules: { bonusShotOnHit: false } });
    const mine = { x: 9, y: 9 };
    s = { ...s, players: s.players.map((p, i) => (i === 1 ? { ...p, board: { ...p.board, obstacles: { '9,9': 'mine' } } } : p)), activePlayer: 0 };
    s = must(applyAction(s, { type: 'FIRE', player: 0, target: mine, targetPlayer: 1 })).state;
    expect(s.players[0].skipNextTurn).toBe(true);
    expect(s.activePlayer).toBe(1);
    s = must(applyAction(s, { type: 'FIRE', player: 1, target: WATER(1), targetPlayer: 2 })).state;
    expect(s.activePlayer).toBe(2);
    s = must(applyAction(s, { type: 'FIRE', player: 2, target: WATER(1), targetPlayer: 1 })).state;
    expect(s.log.at(-1)!.turnSkipped).toBe(0);
    expect(s.activePlayer).toBe(1);
  });

  it('only the defender learns which ship was hit', () => {
    let s = { ...multiGame(3), activePlayer: 0 };
    s = must(applyAction(s, { type: 'FIRE', player: 0, target: { x: 0, y: 0 }, targetPlayer: 1 })).state;
    const hit = (viewer: number) => getPublicView(s, viewer).log.at(-1)!.results[0];
    expect(hit(1).shipUid).toBeDefined();
    expect(hit(0).shipUid).toBeUndefined();
    expect(hit(2).shipUid).toBeUndefined();
    for (const viewer of [0, 2]) {
      for (const seat of getPublicView(s, viewer).players) {
        if (seat.player === viewer) continue;
        expect(seat.board.ships).toHaveLength(0);
      }
    }
  });

  it('sonar counts are hidden from bystanders', () => {
    let s = multiGame(3, { rules: { powerUpsEnabled: true } });
    s = { ...s, activePlayer: 0, players: s.players.map((p, i) => (i === 0 ? { ...p, charge: 100 } : p)) };
    s = must(applyAction(s, { type: 'USE_WEAPON', player: 0, weaponId: 'sonar', target: { x: 1, y: 1 }, targetPlayer: 1 })).state;
    expect(getPublicView(s, 0).log.at(-1)!.sonar).toBeDefined();
    expect(getPublicView(s, 1).log.at(-1)!.sonar).toBeDefined();
    expect(getPublicView(s, 2).log.at(-1)!.sonar).toBeUndefined();
  });
});

describe('teams (2v2)', () => {
  const TEAMS = [0, 0, 1, 1];

  it('interleaves turns and protects allies', () => {
    let s = { ...multiGame(4, { teams: TEAMS }), activePlayer: 0 };
    expect(s.turnOrder).toEqual([0, 2, 1, 3]);
    expect(applyAction(s, { type: 'FIRE', player: 0, target: WATER(0), targetPlayer: 1 }).error).toBe('INVALID_TARGET');
    s = must(applyAction(s, { type: 'FIRE', player: 0, target: WATER(0), targetPlayer: 3 })).state;
    expect(s.activePlayer).toBe(2);
    s = must(applyAction(s, { type: 'FIRE', player: 2, target: WATER(0) })).state;
    expect([0, 1]).toContain(s.log.at(-1)!.against);
    expect(s.activePlayer).toBe(1);
  });

  it('allies see each other’s fleets; enemies stay hidden', () => {
    const v = getPublicView(multiGame(4, { teams: TEAMS }), 0);
    expect(v.teamGame).toBe(true);
    expect(v.players.map((p) => p.team)).toEqual(TEAMS);
    expect(v.players[1].board.ships).toHaveLength(5);
    expect(v.players[2].board.ships).toHaveLength(0);
    expect(v.players[3].board.ships).toHaveLength(0);
    expect(v.enemyBoard.ships).toHaveLength(0);
  });

  it('the whole surviving team wins, including knocked-out teammates', () => {
    let s = { ...multiGame(4, { teams: TEAMS }), activePlayer: 2 };
    s = sinkAll(s, 2, 0);
    expect(s.phase).toBe('battle');
    s = { ...s, activePlayer: 2 };
    s = sinkAll(s, 2, 1);
    expect(s.phase).toBe('finished');
    expect(s.winners).toEqual([2, 3]);
    const ranks = Object.fromEntries(standings(s).map((x) => [x.player, x.rank]));
    expect(ranks).toEqual({ 0: 2, 1: 2, 2: 1, 3: 1 });
  });
});

describe('1v1 compatibility', () => {
  it('omitting targetPlayer fires at the only opponent', () => {
    let s = { ...multiGame(2), activePlayer: 0 };
    s = must(applyAction(s, { type: 'FIRE', player: 0, target: WATER(0) })).state;
    expect(s.log.at(-1)!.against).toBe(1);
    const v = getPublicView(s, 0);
    expect(v.players).toHaveLength(2);
    expect(v.teamGame).toBe(false);
  });

  it('old saves without turn order or eliminations still play', () => {
    const fresh = { ...multiGame(2), activePlayer: 0 };
    const { turnOrder: _t, eliminated: _e, ...legacy } = fresh;
    let s = legacy as GameState;
    s = must(applyAction(s, { type: 'FIRE', player: 0, target: WATER(0) })).state;
    expect(s.activePlayer).toBe(1);
    s = must(applyAction(s, { type: 'FORFEIT', player: 1 })).state;
    expect(s.winner).toBe(0);
  });
});

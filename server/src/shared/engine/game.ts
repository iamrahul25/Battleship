import { resolveShot, resolveSonar } from './attack';
import {
  cloneBoard,
  createBoard,
  inBounds,
  isFleetSunk,
  isShipSunk,
  isSolidObstacle,
  isTargetable,
  legalTargets,
  obstacleAt,
} from './board';
import { CHARGE, MAX_CONSECUTIVE_TIMEOUTS } from './config';
import { generateObstacles, obstacleFields, visibleObstacles } from './obstacles';
import { isFleetComplete, randomFleet, validateFleet } from './placement';
import { createRng, type Rng } from './rng';
import type {
  Action,
  ActionResult,
  Board,
  Coord,
  FinishReason,
  GameErrorCode,
  GameEvent,
  GameState,
  PlacedShip,
  PlayerIndex,
  PlayerPublicInfo,
  PlayerState,
  PublicView,
  RuleSet,
  ShotEvent,
  ShotResult,
  TargetView,
} from './types';
import { canUseWeapon, getWeapon, patternCells } from './weapons';

export const other = (p: PlayerIndex): PlayerIndex => (p === 0 ? 1 : 0);

export function createPlayerState(rules: RuleSet, rng?: Rng): PlayerState {
  return {
    board: { ...createBoard(rules.grid.width, rules.grid.height), ...obstacleFields(rng ? generateObstacles(rules, rng) : undefined) },
    ready: false,
    charge: 0,
    weaponUses: {},
    missStreak: 0,
    consecutiveTimeouts: 0,
    shotsFired: 0,
    hits: 0,
    shipsSunk: 0,
    powerUpsUsed: 0,
  };
}

export function createGame(rules: RuleSet, seed: number): GameState {
  const rng = createRng(seed);
  return {
    rules,
    phase: 'placement',
    players: [createPlayerState(rules, rng), createPlayerState(rules, rng)],
    activePlayer: 0,
    turnNumber: 0,
    winner: null,
    finishReason: null,
    log: [],
    rngState: rng.state,
  };
}

/** Fresh board for a validated fleet, keeping the player's obstacles. */
function fleetBoard(state: GameState, player: PlayerIndex, ships: PlacedShip[]): Board {
  const { width, height } = state.rules.grid;
  return { ...createBoard(width, height), ...obstacleFields(state.players[player].board.obstacles), ships };
}

/** Mutable working copy used inside a single reducer call. */
interface Draft {
  state: GameState;
  events: GameEvent[];
  rng: Rng;
}

function startDraft(state: GameState): Draft {
  return {
    state: {
      ...state,
      players: [{ ...state.players[0] }, { ...state.players[1] }],
      log: state.log.slice(),
    },
    events: [],
    rng: createRng(state.rngState),
  };
}

function finishDraft(d: Draft, error?: GameErrorCode): ActionResult {
  return { state: { ...d.state, rngState: d.rng.state }, events: d.events, error };
}

const fail = (state: GameState, error: GameErrorCode): ActionResult => ({ state, events: [], error });

function setPlayer(d: Draft, idx: PlayerIndex, patch: Partial<PlayerState>) {
  d.state.players[idx] = { ...d.state.players[idx], ...patch };
}

function endGame(d: Draft, winner: PlayerIndex, reason: FinishReason) {
  d.state.phase = 'finished';
  d.state.winner = winner;
  d.state.finishReason = reason;
  d.events.push({ type: 'gameOver', winner, reason });
}

function markReady(d: Draft, player: PlayerIndex) {
  setPlayer(d, player, { ready: true });
  d.events.push({ type: 'ready', player });
  if (d.state.players[0].ready && d.state.players[1].ready) {
    const first = d.rng.int(2) as PlayerIndex;
    d.state.phase = 'battle';
    d.state.activePlayer = first;
    d.state.turnNumber = 1;
    d.events.push({ type: 'battleStart', firstPlayer: first });
  }
}

function addCharge(p: PlayerState, amount: number): number {
  return Math.min(CHARGE.max, p.charge + amount);
}

function pushShot(d: Draft, shot: Omit<ShotEvent, 'turnNumber'>) {
  const ev: ShotEvent = { ...shot, turnNumber: d.state.turnNumber };
  d.state.log.push(ev);
  d.events.push({ type: 'shot', shot: ev });
  const defender = other(shot.by);
  if (isFleetSunk(d.state.players[defender].board)) {
    endGame(d, shot.by, 'sunk');
    ev.turnPassed = false;
    return;
  }
  if (ev.turnPassed) {
    d.state.turnNumber += 1;
    if (d.state.players[defender].skipNextTurn) {
      setPlayer(d, defender, { skipNextTurn: false });
      ev.turnSkipped = defender;
    } else {
      d.state.activePlayer = defender;
    }
  }
}

function fireStandard(d: Draft, player: PlayerIndex, target: Coord, auto: boolean) {
  const defender = other(player);
  const resolved = resolveShot(d.state.players[defender].board, target, d.state.rules);
  setPlayer(d, defender, { board: resolved.board });

  const attacker = d.state.players[player];
  const isHit = resolved.result.result !== 'miss';
  const mineTriggered = resolved.result.obstacle === 'mine';
  const patch: Partial<PlayerState> = {
    shotsFired: attacker.shotsFired + 1,
    hits: attacker.hits + (isHit ? 1 : 0),
    shipsSunk: attacker.shipsSunk + (resolved.result.result === 'sunk' ? 1 : 0),
    consecutiveTimeouts: auto ? attacker.consecutiveTimeouts : 0,
  };
  if (mineTriggered) patch.skipNextTurn = true;
  if (d.state.rules.powerUpsEnabled) {
    if (isHit) {
      patch.missStreak = 0;
      patch.charge = addCharge(attacker, CHARGE.perHit + (resolved.result.result === 'sunk' ? CHARGE.perSunk : 0));
    } else {
      const streak = attacker.missStreak + 1;
      patch.missStreak = streak;
      if (streak % CHARGE.missStreakLength === 0) patch.charge = addCharge(attacker, CHARGE.missStreakBonus);
    }
  }
  setPlayer(d, player, patch);

  pushShot(d, {
    by: player,
    weaponId: 'standard',
    target,
    results: [resolved.result],
    knownEmpty: resolved.knownEmpty.length ? resolved.knownEmpty : undefined,
    turnPassed: !isHit || !d.state.rules.bonusShotOnHit,
    auto: auto || undefined,
    mineTriggered: mineTriggered || undefined,
  });
}

function checkTurn(state: GameState, player: PlayerIndex): GameErrorCode | null {
  if (state.phase !== 'battle') return 'WRONG_PHASE';
  if (state.activePlayer !== player) return 'NOT_YOUR_TURN';
  return null;
}

/** Pure reducer. Never mutates `state`. */
export function applyAction(state: GameState, action: Action): ActionResult {
  switch (action.type) {
    case 'PLACE_FLEET': {
      if (state.phase !== 'placement') return fail(state, 'WRONG_PHASE');
      const p = state.players[action.player];
      if (p.ready) return fail(state, 'ALREADY_READY');
      const v = validateFleet(
        state.rules,
        action.ships.map((s) => ({ defId: s.defId, origin: s.origin, rotation: s.rotation })),
        p.board.obstacles,
      );
      if (!v.ok) return fail(state, 'INVALID_PLACEMENT');
      const d = startDraft(state);
      setPlayer(d, action.player, { board: fleetBoard(state, action.player, v.ships) });
      d.events.push({ type: 'fleetPlaced', player: action.player });
      return finishDraft(d);
    }

    case 'READY': {
      if (state.phase !== 'placement') return fail(state, 'WRONG_PHASE');
      const p = state.players[action.player];
      if (p.ready) return fail(state, 'ALREADY_READY');
      if (!isFleetComplete(p.board, state.rules)) return fail(state, 'FLEET_INCOMPLETE');
      const d = startDraft(state);
      markReady(d, action.player);
      return finishDraft(d);
    }

    case 'FIRE': {
      const err = checkTurn(state, action.player);
      if (err) return fail(state, err);
      const board = state.players[other(action.player)].board;
      if (!inBounds(board, action.target)) return fail(state, 'OUT_OF_BOUNDS');
      if (isSolidObstacle(obstacleAt(board, action.target))) return fail(state, 'BLOCKED');
      if (!isTargetable(board, action.target)) return fail(state, 'ALREADY_FIRED');
      const d = startDraft(state);
      fireStandard(d, action.player, action.target, false);
      return finishDraft(d);
    }

    case 'USE_WEAPON': {
      const err = checkTurn(state, action.player);
      if (err) return fail(state, err);
      const weapon = getWeapon(action.weaponId);
      if (!weapon) return fail(state, 'WEAPON_UNKNOWN');
      if (weapon.id === 'standard') return applyAction(state, { type: 'FIRE', player: action.player, target: action.target });
      if (!state.rules.powerUpsEnabled) return fail(state, 'POWERUPS_DISABLED');
      const attacker = state.players[action.player];
      if (!canUseWeapon(attacker, weapon, state.rules)) return fail(state, 'WEAPON_NOT_READY');
      const defenderIdx = other(action.player);
      const board = state.players[defenderIdx].board;
      if (!inBounds(board, action.target)) return fail(state, 'OUT_OF_BOUNDS');
      const area = patternCells(weapon, action.target, board, action.orientation);

      const d = startDraft(state);
      const usage: Partial<PlayerState> = {
        charge: attacker.charge - weapon.cost,
        weaponUses: { ...attacker.weaponUses, [weapon.id]: (attacker.weaponUses[weapon.id] ?? 0) + 1 },
        powerUpsUsed: attacker.powerUpsUsed + 1,
        consecutiveTimeouts: 0,
      };

      if (weapon.kind === 'reveal') {
        setPlayer(d, action.player, usage);
        pushShot(d, {
          by: action.player,
          weaponId: weapon.id,
          target: action.target,
          results: [],
          sonar: resolveSonar(board, area),
          turnPassed: true,
        });
        return finishDraft(d);
      }

      const targets = area.filter((c) => isTargetable(board, c));
      if (targets.length === 0) return fail(state, 'ALREADY_FIRED');
      let current: Board = board;
      const results: ShotResult[] = [];
      const knownEmpty: Coord[] = [];
      for (const c of targets) {
        if (!isTargetable(current, c)) continue; // may have become knownEmpty after a sink in this volley
        const r = resolveShot(current, c, state.rules);
        current = r.board;
        results.push(r.result);
        knownEmpty.push(...r.knownEmpty);
      }
      const hits = results.filter((r) => r.result !== 'miss').length;
      const mineTriggered = results.some((r) => r.obstacle === 'mine');
      setPlayer(d, defenderIdx, { board: current });
      setPlayer(d, action.player, {
        ...usage,
        shotsFired: attacker.shotsFired + results.length,
        hits: attacker.hits + hits,
        shipsSunk: attacker.shipsSunk + results.filter((r) => r.result === 'sunk').length,
        ...(mineTriggered ? { skipNextTurn: true } : {}),
      });
      pushShot(d, {
        by: action.player,
        weaponId: weapon.id,
        target: action.target,
        results,
        knownEmpty: knownEmpty.length ? knownEmpty : undefined,
        turnPassed: true,
        mineTriggered: mineTriggered || undefined,
      });
      return finishDraft(d);
    }

    case 'TIMEOUT': {
      if (state.phase === 'placement') {
        const p = state.players[action.player];
        if (p.ready) return fail(state, 'ALREADY_READY');
        const d = startDraft(state);
        if (!isFleetComplete(p.board, state.rules)) {
          const ships = randomFleet(state.rules, d.rng, { obstacles: p.board.obstacles });
          setPlayer(d, action.player, { board: fleetBoard(state, action.player, ships) });
          d.events.push({ type: 'fleetPlaced', player: action.player });
        }
        markReady(d, action.player);
        return finishDraft(d);
      }
      const err = checkTurn(state, action.player);
      if (err) return fail(state, err);
      const d = startDraft(state);
      const timeouts = state.players[action.player].consecutiveTimeouts + 1;
      setPlayer(d, action.player, { consecutiveTimeouts: timeouts });
      if (timeouts >= MAX_CONSECUTIVE_TIMEOUTS) {
        endGame(d, other(action.player), 'timeout');
        return finishDraft(d);
      }
      const targets = legalTargets(state.players[other(action.player)].board);
      fireStandard(d, action.player, d.rng.pick(targets), true);
      return finishDraft(d);
    }

    case 'FORFEIT': {
      if (state.phase === 'finished') return fail(state, 'WRONG_PHASE');
      const d = startDraft(state);
      endGame(d, other(action.player), action.reason ?? 'forfeit');
      return finishDraft(d);
    }
  }
}

/** Opponent board with ship positions hidden (unless revealed at game end). */
export function redactBoard(board: Board, reveal: boolean): TargetView {
  const ships = reveal ? board.ships : board.ships.filter(isShipSunk);
  return {
    width: board.width,
    height: board.height,
    shots: { ...board.shots },
    ships: ships.map((s) => ({ ...s, origin: { ...s.origin }, cells: s.cells.map((c) => ({ ...c })) })),
    ...obstacleFields(visibleObstacles(board, reveal)),
  };
}

/** Strips which ship was hit from the attacker's perspective (only sunk ships are identified). */
export function redactShotEvent(event: ShotEvent, viewer: PlayerIndex): ShotEvent {
  if (event.by !== viewer) return event;
  return {
    ...event,
    results: event.results.map((r) => (r.result === 'hit' ? { coord: r.coord, result: 'hit' } : r)),
  };
}

export function publicInfo(p: PlayerState): PlayerPublicInfo {
  const lost = p.board.ships.filter(isShipSunk);
  return {
    ready: p.ready,
    charge: p.charge,
    weaponUses: { ...p.weaponUses },
    shotsFired: p.shotsFired,
    hits: p.hits,
    shipsRemaining: p.board.ships.length - lost.length,
    shipsLost: lost.map((s) => s.defId),
    consecutiveTimeouts: p.consecutiveTimeouts,
    powerUpsUsed: p.powerUpsUsed,
  };
}

/** Everything `viewer` is allowed to know. Never contains un-sunk enemy ship positions before game end. */
export function getPublicView(state: GameState, viewer: PlayerIndex): PublicView {
  const enemyIdx = other(viewer);
  const finished = state.phase === 'finished';
  return {
    rules: state.rules,
    phase: state.phase,
    viewer,
    activePlayer: state.activePlayer,
    turnNumber: state.turnNumber,
    winner: state.winner,
    finishReason: state.finishReason,
    myBoard: cloneBoard(state.players[viewer].board),
    enemyBoard: redactBoard(state.players[enemyIdx].board, finished),
    me: publicInfo(state.players[viewer]),
    enemy: publicInfo(state.players[enemyIdx]),
    log: finished ? state.log.slice() : state.log.map((e) => redactShotEvent(e, viewer)),
  };
}

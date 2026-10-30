import { resolveShot, resolveSonar } from './attack';
import {
  cellAt,
  cloneBoard,
  createBoard,
  inBounds,
  isFleetSunk,
  isShipSunk,
  isSolidObstacle,
  isTargetable,
  key,
  legalTargets,
  obstacleAt,
  shipAt,
} from './board';
import { CHARGE, MAX_CONSECUTIVE_TIMEOUTS } from './config';
import { generateObstacles, obstacleFields, relocateMines, visibleObstacles } from './obstacles';
import { isFleetComplete, randomFleet, validateFleet } from './placement';
import { createRng, type Rng } from './rng';
import {
  areAllies,
  enemiesOf,
  interleavedOrder,
  isAlive,
  livingTeams,
  seatsOf,
  standings,
  teamOf,
  turnOrderOf,
} from './seats';
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
import { canUseWeapon, getWeapon, patternCells, torpedoHasTarget, torpedoLane } from './weapons';

/** The opponent in a 1v1 game. */
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

export interface GameSetup {
  /** Number of seats (default 2). */
  players?: number;
  /** Team id per seat; omitted for free-for-all. */
  teams?: number[];
}

export function createGame(rules: RuleSet, seed: number, setup: GameSetup = {}): GameState {
  const rng = createRng(seed);
  const count = setup.teams?.length ?? setup.players ?? 2;
  const players = Array.from({ length: count }, () => createPlayerState(rules, rng));
  const seats = players.map((_, i) => i);
  return {
    rules,
    phase: 'placement',
    players,
    turnOrder: setup.teams ? interleavedOrder(setup.teams) : seats,
    ...(setup.teams ? { teams: setup.teams.slice() } : {}),
    eliminated: [],
    activePlayer: 0,
    turnNumber: 0,
    winner: null,
    finishReason: null,
    log: [],
    rngState: rng.state,
  };
}

/** Fresh board for a validated fleet, keeping the player's obstacles unless new ones are given. */
function fleetBoard(state: GameState, player: PlayerIndex, ships: PlacedShip[], obstacles = state.players[player].board.obstacles): Board {
  const { width, height } = state.rules.grid;
  return { ...createBoard(width, height), ...obstacleFields(obstacles), ships };
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
      players: state.players.map((p) => ({ ...p })),
      eliminated: (state.eliminated ?? []).slice(),
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

/** The surviving team wins, including teammates who were knocked out along the way. */
function endGame(d: Draft, reason: FinishReason) {
  const team = livingTeams(d.state)[0];
  const winners = team === undefined ? [] : seatsOf(d.state).filter((p) => teamOf(d.state, p) === team);
  d.state.phase = 'finished';
  d.state.winner = winners[0] ?? null;
  d.state.winners = winners;
  d.state.finishReason = reason;
  d.events.push({ type: 'gameOver', winner: winners[0] ?? -1, winners, reason });
}

/** Starts the battle once every seat still in the game is ready. */
function maybeStartBattle(d: Draft) {
  if (d.state.phase !== 'placement') return;
  const living = turnOrderOf(d.state).filter((p) => isAlive(d.state, p));
  if (!living.every((p) => d.state.players[p].ready)) return;
  const first = living[d.rng.int(living.length)];
  d.state.phase = 'battle';
  d.state.activePlayer = first;
  d.state.turnNumber = 1;
  d.events.push({ type: 'battleStart', firstPlayer: first });
}

function markReady(d: Draft, player: PlayerIndex) {
  setPlayer(d, player, { ready: true });
  d.events.push({ type: 'ready', player });
  maybeStartBattle(d);
}

/** Hands the turn to the next seat in rotation, skipping knocked-out seats and serving mine penalties. */
function advanceTurn(d: Draft, from: PlayerIndex, ev?: ShotEvent) {
  d.state.turnNumber += 1;
  const order = turnOrderOf(d.state);
  let idx = order.indexOf(from);
  for (let i = 0; i < order.length * 2; i++) {
    idx = (idx + 1) % order.length;
    const p = order[idx];
    if (!isAlive(d.state, p)) continue;
    if (d.state.players[p].skipNextTurn) {
      setPlayer(d, p, { skipNextTurn: false });
      if (ev && ev.turnSkipped === undefined) ev.turnSkipped = p;
      continue;
    }
    d.state.activePlayer = p;
    return;
  }
}

/** Knocks a seat out. Returns true when that ended the game. */
function eliminate(d: Draft, player: PlayerIndex, reason: FinishReason): boolean {
  if (!isAlive(d.state, player)) return false;
  setPlayer(d, player, { out: reason, skipNextTurn: false });
  d.state.eliminated = [...(d.state.eliminated ?? []), player];
  d.events.push({ type: 'eliminated', player, reason });
  if (livingTeams(d.state).length <= 1) {
    endGame(d, reason);
    return true;
  }
  if (d.state.phase === 'battle' && d.state.activePlayer === player) advanceTurn(d, player);
  else maybeStartBattle(d);
  return false;
}

/** The seat to fire at: the requested one, or the first enemy still afloat. */
function resolveTarget(state: GameState, player: PlayerIndex, requested?: PlayerIndex): PlayerIndex | null {
  const enemies = enemiesOf(state, player);
  if (requested === undefined) return enemies[0] ?? null;
  return enemies.includes(requested) ? requested : null;
}

function addCharge(p: PlayerState, amount: number): number {
  return Math.min(CHARGE.max, p.charge + amount);
}

function pushShot(d: Draft, shot: Omit<ShotEvent, 'turnNumber'> & { against: PlayerIndex }) {
  const ev: ShotEvent = { ...shot, turnNumber: d.state.turnNumber };
  d.state.log.push(ev);
  d.events.push({ type: 'shot', shot: ev });
  if (isFleetSunk(d.state.players[shot.against].board) && eliminate(d, shot.against, 'sunk')) {
    ev.turnPassed = false;
    return;
  }
  if (ev.turnPassed) advanceTurn(d, shot.by, ev);
}

function fireStandard(d: Draft, player: PlayerIndex, defender: PlayerIndex, target: Coord, auto: boolean) {
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
    against: defender,
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
      if (state.phase !== 'placement' || !isAlive(state, action.player)) return fail(state, 'WRONG_PHASE');
      const p = state.players[action.player];
      if (p.ready) return fail(state, 'ALREADY_READY');
      const obstacles = action.mines ? relocateMines(p.board, action.mines) : p.board.obstacles;
      if (obstacles === null) return fail(state, 'INVALID_PLACEMENT');
      const v = validateFleet(
        state.rules,
        action.ships.map((s) => ({ defId: s.defId, origin: s.origin, rotation: s.rotation })),
        obstacles,
      );
      if (!v.ok) return fail(state, 'INVALID_PLACEMENT');
      const d = startDraft(state);
      setPlayer(d, action.player, { board: fleetBoard(state, action.player, v.ships, obstacles) });
      d.events.push({ type: 'fleetPlaced', player: action.player });
      return finishDraft(d);
    }

    case 'READY': {
      if (state.phase !== 'placement' || !isAlive(state, action.player)) return fail(state, 'WRONG_PHASE');
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
      const defender = resolveTarget(state, action.player, action.targetPlayer);
      if (defender === null) return fail(state, 'INVALID_TARGET');
      const board = state.players[defender].board;
      if (!inBounds(board, action.target)) return fail(state, 'OUT_OF_BOUNDS');
      if (isSolidObstacle(obstacleAt(board, action.target))) return fail(state, 'BLOCKED');
      if (!isTargetable(board, action.target)) return fail(state, 'ALREADY_FIRED');
      const d = startDraft(state);
      fireStandard(d, action.player, defender, action.target, false);
      return finishDraft(d);
    }

    case 'USE_WEAPON': {
      const err = checkTurn(state, action.player);
      if (err) return fail(state, err);
      const weapon = getWeapon(action.weaponId);
      if (!weapon) return fail(state, 'WEAPON_UNKNOWN');
      if (weapon.id === 'standard') {
        return applyAction(state, { type: 'FIRE', player: action.player, target: action.target, targetPlayer: action.targetPlayer });
      }
      if (!state.rules.powerUpsEnabled) return fail(state, 'POWERUPS_DISABLED');
      const attacker = state.players[action.player];
      if (!canUseWeapon(attacker, weapon, state.rules)) return fail(state, 'WEAPON_NOT_READY');
      const defenderIdx = resolveTarget(state, action.player, action.targetPlayer);
      if (defenderIdx === null) return fail(state, 'INVALID_TARGET');
      const board = state.players[defenderIdx].board;
      if (!inBounds(board, action.target)) return fail(state, 'OUT_OF_BOUNDS');

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
          against: defenderIdx,
          weaponId: weapon.id,
          target: action.target,
          results: [],
          sonar: resolveSonar(board, patternCells(weapon, action.target, board)),
          turnPassed: true,
        });
        return finishDraft(d);
      }

      let current: Board = board;
      const results: ShotResult[] = [];
      const knownEmpty: Coord[] = [];
      let path: Coord[] | undefined;
      const fireAt = (c: Coord) => {
        const r = resolveShot(current, c, state.rules);
        current = r.board;
        results.push(r.result);
        knownEmpty.push(...r.knownEmpty);
      };

      if (weapon.kind === 'random') {
        const pool = (b: Board) => legalTargets(b).filter((c) => obstacleAt(b, c) !== 'reef');
        if (pool(board).length === 0) return fail(state, 'ALREADY_FIRED');
        for (let i = 0; i < (weapon.shots ?? 1); i++) {
          const open = pool(current);
          if (open.length === 0) break;
          fireAt(d.rng.pick(open));
        }
      } else if (weapon.kind === 'torpedo') {
        const lane = torpedoLane(board, action.target);
        if (lane.length === 0) return fail(state, 'BLOCKED');
        if (!torpedoHasTarget(board, lane)) return fail(state, 'ALREADY_FIRED');
        path = [];
        for (const c of lane) {
          path.push(c);
          // Passes over cells already fired at and over reefs.
          if (cellAt(current, c) !== 'unknown') continue;
          const ob = obstacleAt(current, c);
          if (ob === 'reef') continue;
          if (ob === 'mine' || shipAt(current.ships, c)) {
            fireAt(c);
            break;
          }
          current = { ...current, shots: { ...current.shots, [key(c)]: 'knownEmpty' } };
          knownEmpty.push(c);
        }
      } else {
        const targets = patternCells(weapon, action.target, board).filter((c) => isTargetable(board, c));
        if (targets.length === 0) return fail(state, 'ALREADY_FIRED');
        for (const c of targets) {
          if (isTargetable(current, c)) fireAt(c); // may have become knownEmpty after a sink in this volley
        }
      }

      const hits = results.filter((r) => r.result !== 'miss').length;
      // A torpedo that runs into a mine just detonates it; only shells fired onto a mine cost a turn.
      const mineTriggered = weapon.kind !== 'torpedo' && results.some((r) => r.obstacle === 'mine');
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
        against: defenderIdx,
        weaponId: weapon.id,
        target: action.target,
        results,
        knownEmpty: knownEmpty.length ? knownEmpty : undefined,
        path,
        turnPassed: true,
        mineTriggered: mineTriggered || undefined,
      });
      return finishDraft(d);
    }

    case 'TIMEOUT': {
      if (!isAlive(state, action.player)) return fail(state, 'WRONG_PHASE');
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
        eliminate(d, action.player, 'timeout');
        return finishDraft(d);
      }
      const enemies = enemiesOf(state, action.player);
      const defender = enemies.length === 1 ? enemies[0] : d.rng.pick(enemies);
      const targets = legalTargets(state.players[defender].board);
      fireStandard(d, action.player, defender, d.rng.pick(targets), true);
      return finishDraft(d);
    }

    case 'FORFEIT': {
      if (state.phase === 'finished' || !isAlive(state, action.player)) return fail(state, 'WRONG_PHASE');
      const d = startDraft(state);
      eliminate(d, action.player, action.reason ?? 'forfeit');
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

/**
 * Only the defending team learns which ship was hit (everyone else just sees hit / sunk),
 * and sonar counts are shared with the shooting and defending teams only.
 */
export function redactShotEvent(event: ShotEvent, viewer: PlayerIndex, state?: Pick<GameState, 'teams'>): ShotEvent {
  const against = event.against ?? other(event.by);
  const sameSide = (p: PlayerIndex) => p === viewer || (!!state && areAllies(state, p, viewer));
  if (sameSide(against)) return event;
  const out: ShotEvent = {
    ...event,
    results: event.results.map((r) => (r.result === 'hit' ? { coord: r.coord, result: 'hit' } : r)),
  };
  if (out.sonar && !sameSide(event.by)) delete out.sonar;
  return out;
}

export function publicInfo(p: PlayerState): PlayerPublicInfo {
  const lost = p.board.ships.filter(isShipSunk);
  return {
    ready: p.ready,
    charge: p.charge,
    weaponUses: { ...p.weaponUses },
    shotsFired: p.shotsFired,
    hits: p.hits,
    shipsSunk: p.shipsSunk,
    shipsRemaining: p.board.ships.length - lost.length,
    shipsLost: lost.map((s) => s.defId),
    consecutiveTimeouts: p.consecutiveTimeouts,
    powerUpsUsed: p.powerUpsUsed,
  };
}

/** Everything `viewer` is allowed to know. Never contains un-sunk enemy ship positions before game end. */
export function getPublicView(state: GameState, viewer: PlayerIndex): PublicView {
  const finished = state.phase === 'finished';
  const enemies = seatsOf(state).filter((p) => p !== viewer && !areAllies(state, viewer, p));
  const enemyIdx = enemies.find((p) => isAlive(state, p)) ?? enemies[0] ?? other(viewer);
  const boardFor = (p: PlayerIndex): TargetView => {
    const board = state.players[p].board;
    if (p === viewer || areAllies(state, viewer, p)) return cloneBoard(board);
    return redactBoard(board, finished || !isAlive(state, p));
  };
  const myBoard = cloneBoard(state.players[viewer].board);
  return {
    rules: state.rules,
    phase: state.phase,
    viewer,
    activePlayer: state.activePlayer,
    turnNumber: state.turnNumber,
    winner: state.winner,
    finishReason: state.finishReason,
    myBoard,
    enemyBoard: boardFor(enemyIdx),
    me: publicInfo(state.players[viewer]),
    enemy: publicInfo(state.players[enemyIdx]),
    log: finished ? state.log.slice() : state.log.map((e) => redactShotEvent(e, viewer, state)),
    players: seatsOf(state).map((p) => ({
      player: p,
      team: teamOf(state, p),
      out: state.players[p].out ?? null,
      info: publicInfo(state.players[p]),
      board: p === viewer ? myBoard : boardFor(p),
    })),
    turnOrder: turnOrderOf(state),
    teamGame: !!state.teams,
    winners: state.winners ?? (state.winner !== null ? [state.winner] : []),
    standings: finished ? standings(state) : null,
  };
}

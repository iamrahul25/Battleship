import { boot, type ColyseusTestServer } from '@colyseus/testing';
import type { Room as SDKRoom } from '@colyseus/sdk';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createGameServer } from '../src/app';
import type { BattleRoom } from '../src/rooms/BattleRoom';
import { isStraightShip, ONLINE_PLACEMENT_TIME_MS, type PlacedShip, type PublicView } from '../src/shared/engine';
import { PROTOCOL_VERSION, ROOM_NAME } from '../src/shared/protocol';
import { rowFleet } from './helpers';

let colyseus: ColyseusTestServer;

beforeAll(async () => {
  colyseus = await boot(createGameServer({ gracefullyShutdown: false }));
});
afterAll(async () => {
  await colyseus.shutdown();
});
afterEach(async () => {
  await colyseus.cleanup();
});

type Msg = { type: string; payload: any };

/** Records every message so assertions never race delivery. */
function record(room: SDKRoom) {
  const messages: Msg[] = [];
  const waiters: { pred: (m: Msg) => boolean; resolve: (m: Msg) => void }[] = [];
  room.onMessage('*', (type, payload) => {
    const m = { type: String(type), payload };
    messages.push(m);
    for (const w of waiters.slice()) {
      if (w.pred(m)) {
        waiters.splice(waiters.indexOf(w), 1);
        w.resolve(m);
      }
    }
  });
  const waitFor = (type: string, pred: (p: any) => boolean = () => true, timeout = 5000): Promise<any> => {
    const existing = messages.find((m) => m.type === type && pred(m.payload));
    if (existing) {
      messages.splice(messages.indexOf(existing), 1);
      return Promise.resolve(existing.payload);
    }
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), timeout);
      waiters.push({
        pred: (m) => m.type === type && pred(m.payload),
        resolve: (m) => {
          clearTimeout(t);
          messages.splice(messages.indexOf(m), 1);
          resolve(m.payload);
        },
      });
    });
  };
  return { room, messages, all: [] as Msg[], waitFor };
}

/** Defaults to Classic so the straight `rowFleet` is a legal placement. */
const join = (name: string, extra: Record<string, unknown> = {}) => ({
  protocolVersion: PROTOCOL_VERSION,
  mode: 'classic',
  profile: { playerId: name, name, avatarId: 'captain', wins: 1, losses: 2 },
  ...extra,
});

const fleetPayload = (ships: PlacedShip[]) => ({
  ships: ships.map((s) => ({ defId: s.defId, x: s.origin.x, y: s.origin.y, rotation: s.rotation })),
});

/** Vertical fleet in columns 9,7,5,3,1 so it differs from rowFleet. */
function columnFleet(): PlacedShip[] {
  return rowFleet().map((s, i) => {
    const x = 9 - i * 2;
    return { ...s, origin: { x, y: 0 }, rotation: 90, cells: s.cells.map((c) => ({ x, y: c.x })) };
  });
}

async function startMatch(extra: Record<string, unknown> = {}) {
  const roomA = await colyseus.sdk.joinOrCreate(ROOM_NAME, join('Alice', extra));
  const a = record(roomA);
  const roomB = await colyseus.sdk.joinOrCreate(ROOM_NAME, join('Bobby', extra));
  const b = record(roomB);
  const server = colyseus.getRoomById<BattleRoom>(roomA.roomId);
  return { a, b, server };
}

async function toBattle(extra: Record<string, unknown> = {}) {
  const m = await startMatch(extra);
  m.a.room.send('place_fleet', fleetPayload(rowFleet()));
  m.b.room.send('place_fleet', fleetPayload(columnFleet()));
  await m.a.waitFor('your_fleet');
  await m.b.waitFor('your_fleet');
  m.a.room.send('ready', {});
  m.b.room.send('ready', {});
  await m.a.waitFor('sync', (p) => p.view.phase === 'battle');
  await m.b.waitFor('sync', (p) => p.view.phase === 'battle');
  const aFirst = m.server.state.activeSessionId === m.a.room.sessionId;
  const first = aFirst ? m.a : m.b;
  const second = aFirst ? m.b : m.a;
  return { ...m, first, second };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('matchmaking', () => {
  it('pairs two quick-match players into one room and starts placement', async () => {
    const { a, b, server } = await startMatch();
    expect(a.room.roomId).toBe(b.room.roomId);
    const sync = await a.waitFor('sync');
    expect(sync.view.phase).toBe('placement');
    expect(server.state.phase).toBe('placement');
    expect(server.state.players.size).toBe(2);
    expect(server.locked).toBe(true);
    expect(server.state.turnDeadline).toBeGreaterThan(Date.now());
  });

  it('keeps classic and advance queues apart', async () => {
    const a = await colyseus.sdk.joinOrCreate(ROOM_NAME, join('Alice', { mode: 'classic' }));
    const b = await colyseus.sdk.joinOrCreate(ROOM_NAME, join('Bobby', { mode: 'advance' }));
    expect(a.roomId).not.toBe(b.roomId);
  });

  it('pairs older builds that send a different non-classic mode id into the Advance queue', async () => {
    const a = await colyseus.sdk.joinOrCreate(ROOM_NAME, join('Alice', { mode: 'advance' }));
    const b = await colyseus.sdk.joinOrCreate(ROOM_NAME, join('Bobby', { mode: 'legacy-mode' }));
    expect(b.roomId).toBe(a.roomId);
    expect(colyseus.getRoomById<BattleRoom>(a.roomId).state.mode).toBe('advance');
  });

  it('rejects outdated clients', async () => {
    await expect(colyseus.sdk.joinOrCreate(ROOM_NAME, join('Alice', { protocolVersion: 0 }))).rejects.toThrow();
  });

  it('private rooms: code lookup, not matched by quick match', async () => {
    const host = await colyseus.sdk.create(ROOM_NAME, join('Alice', { private: true }));
    const server = colyseus.getRoomById<BattleRoom>(host.roomId);
    const code = server.state.code;
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);

    const quick = await colyseus.sdk.joinOrCreate(ROOM_NAME, join('Stray'));
    expect(quick.roomId).not.toBe(host.roomId);

    const res = await colyseus.http.get(`/rooms/code/${code.toLowerCase()}`);
    expect(res.data.roomId).toBe(host.roomId);
    await expect(colyseus.http.get('/rooms/code/ZZZZZZ')).rejects.toBeTruthy();

    const guest = await colyseus.sdk.joinById(res.data.roomId, join('Guest'));
    expect(guest.roomId).toBe(host.roomId);
    await sleep(50);
    expect(server.state.phase).toBe('placement');
  });

  it('health endpoint', async () => {
    const res = await colyseus.http.get('/health');
    expect(res.data.ok).toBe(true);
    expect(res.data.protocolVersion).toBe(PROTOCOL_VERSION);
  });

  it('sanitizes nicknames', async () => {
    const r = await colyseus.sdk.joinOrCreate(ROOM_NAME, join('  x '));
    const server = colyseus.getRoomById<BattleRoom>(r.roomId);
    expect(server.state.players.get(r.sessionId)!.name).toMatch(/^Sailor\d{3}$/);
  });
});

describe('table settings', () => {
  it('quick match always plays the standard table, ignoring size/obstacle options', async () => {
    const { a, server } = await startMatch({ mode: 'advance', boardSize: 14, obstacles: 'many' });
    expect(server.rules.grid).toEqual({ width: 10, height: 10 });
    expect(server.rules.obstacles ?? 'none').toBe('none');
    expect(server.rules.powerUpsEnabled).toBe(true);
    expect(server.rules.fleet.some((d) => !isStraightShip(d))).toBe(true);
    expect(server.state.boardSize).toBe(10);
    expect(server.state.obstacles).toBe('none');
    const sync = await a.waitFor('sync');
    expect(Object.keys(sync.view.myBoard.obstacles ?? {})).toHaveLength(0);
  });

  it('classic quick match keeps the straight fleet', async () => {
    const { server } = await startMatch({ mode: 'classic' });
    expect(server.rules.powerUpsEnabled).toBe(false);
    expect(server.rules.fleet.every(isStraightShip)).toBe(true);
  });

  it('private rooms play the host table and sync it to both players', async () => {
    const host = record(await colyseus.sdk.create(ROOM_NAME, join('Alice', { private: true, mode: 'advance', boardSize: 12, obstacles: 'many' })));
    const server = colyseus.getRoomById<BattleRoom>(host.room.roomId);
    expect(server.rules.grid).toEqual({ width: 12, height: 12 });
    expect(server.rules.obstacles).toBe('many');
    expect(server.rules.placementTimeMs).toBeGreaterThan(ONLINE_PLACEMENT_TIME_MS);
    if (!host.room.state.phase) await new Promise<void>((resolve) => host.room.onStateChange.once(() => resolve()));
    expect(host.room.state.boardSize).toBe(12);
    expect(host.room.state.obstacles).toBe('many');

    const guest = record(await colyseus.sdk.joinById(host.room.roomId, join('Guest', { boardSize: 7, obstacles: 'none' })));
    const sync = await guest.waitFor('sync');
    expect(sync.view.rules.grid.width).toBe(12);
    expect(Object.keys(sync.view.myBoard.obstacles).length).toBeGreaterThan(0);
    expect(server.rules.grid.width).toBe(12);
  });

  it('auto-placed fleets on a private obstacle table avoid solid cells and the battle starts', async () => {
    const host = record(
      await colyseus.sdk.create(ROOM_NAME, join('Alice', { private: true, mode: 'advance', boardSize: 8, obstacles: 'many', placementTimeMs: 300 })),
    );
    const guest = record(await colyseus.sdk.joinById(host.room.roomId, join('Guest')));
    const server = colyseus.getRoomById<BattleRoom>(host.room.roomId);
    const fleet: PlacedShip[] = await host.waitFor('your_fleet', undefined, 3000);
    await guest.waitFor('your_fleet', undefined, 3000);
    await host.waitFor('sync', (p) => p.view.phase === 'battle');
    const seat = server.seats.find((s) => s.sessionId === host.room.sessionId)!.index;
    const obstacles = server.game!.players[seat].board.obstacles ?? {};
    for (const s of fleet) for (const c of s.cells) expect(obstacles[`${c.x},${c.y}`]).toBeUndefined();
    expect(fleet.every((s) => s.cells.every((c) => c.x < 8 && c.y < 8))).toBe(true);
  });

  it('rejects out-of-range private settings', async () => {
    await expect(colyseus.sdk.create(ROOM_NAME, join('Alice', { private: true, boardSize: 30 }))).rejects.toThrow();
    await expect(colyseus.sdk.create(ROOM_NAME, join('Alice', { private: true, obstacles: 'lava' }))).rejects.toThrow();
  });
});

describe('placement', () => {
  it('rejects invalid fleets and enforces the fleet before ready', async () => {
    const { a } = await startMatch();
    a.room.send('ready', {});
    expect((await a.waitFor('error')).code).toBe('FLEET_INCOMPLETE');
    const bad = fleetPayload(rowFleet());
    bad.ships[1].y = 1; // touching the carrier
    a.room.send('place_fleet', bad);
    expect((await a.waitFor('error')).code).toBe('INVALID_PLACEMENT');
    a.room.send('place_fleet', { ships: 'nope' });
    expect((await a.waitFor('error')).code).toBe('INVALID_MESSAGE');
  });

  it('auto-randomizes fleets when the placement timer expires', async () => {
    const { a, b, server } = await startMatch({ placementTimeMs: 300 });
    const fleetA = await a.waitFor('your_fleet', undefined, 3000);
    await b.waitFor('your_fleet', undefined, 3000);
    expect(fleetA).toHaveLength(5);
    await sleep(50);
    expect(server.state.phase).toBe('battle');
  });
});

describe('battle', () => {
  it('enforces turns and broadcasts shot results to both players', async () => {
    const { first, second, server } = await toBattle();
    second.room.send('fire', { x: 0, y: 0 });
    expect((await second.waitFor('error')).code).toBe('NOT_YOUR_TURN');

    first.room.send('fire', { x: 4, y: 9 }); // empty in both fleets
    const r1 = await first.waitFor('shot_result');
    const r2 = await second.waitFor('shot_result');
    expect(r1.event.results[0].result).toBe('miss');
    expect(r2.event.target).toEqual({ x: 4, y: 9 });
    await sleep(20);
    expect(server.state.activeSessionId).toBe(second.room.sessionId);

    second.room.send('fire', { x: 4, y: 9 });
    await second.waitFor('shot_result');
    first.room.send('fire', { x: 4, y: 9 });
    expect((await first.waitFor('error')).code).toBe('ALREADY_FIRED');
  });

  it('never leaks the opponent fleet before game end', async () => {
    const { a, b, first, second } = await toBattle();
    const all: Msg[] = [];
    for (const c of [a, b]) c.room.onMessage('*', (type, payload) => all.push({ type: String(type), payload }));
    // Fire a few shots including hits (bonus shot keeps the turn on hit).
    for (const target of [{ x: 0, y: 0 }, { x: 9, y: 0 }, { x: 1, y: 0 }, { x: 9, y: 1 }]) {
      const shooter = first.room.sessionId === (colyseus.getRoomById<BattleRoom>(a.room.roomId).state.activeSessionId) ? first : second;
      shooter.room.send('fire', target);
      await shooter.waitFor('shot_result');
    }
    for (const m of all) {
      const view: PublicView | undefined = m.payload?.view;
      if (!view) continue;
      for (const s of view.enemyBoard.ships) expect(s.hits).toBe(s.cells.length);
      for (const e of view.log) {
        if (e.by === view.viewer) for (const r of e.results) if (r.result === 'hit') expect(r.shipUid).toBeUndefined();
      }
    }
    const stateJson = JSON.stringify(a.room.state);
    expect(stateJson).not.toMatch(/cells|origin/);
  });

  it('turn timeout fires an automatic shot; 3 timeouts forfeit', async () => {
    const { first, second } = await toBattle({ turnTimeMs: 250 });
    const auto = await first.waitFor('shot_result', (p) => p.event.auto === true, 3000);
    expect(auto.event.by).toBe(auto.view.viewer);
    const over = await second.waitFor('game_over', undefined, 10_000);
    expect(over.reason).toBe('timeout');
    expect(over.revealFleet).toHaveLength(5);
  });

  it('forfeit ends the game, reveals fleets, and rematch restarts placement', async () => {
    const { first, second, server } = await toBattle();
    first.room.send('forfeit', {});
    const o1 = await first.waitFor('game_over');
    const o2 = await second.waitFor('game_over');
    expect(o1.youWon).toBe(false);
    expect(o2.youWon).toBe(true);
    expect(o2.reason).toBe('forfeit');
    expect(o2.revealFleet).toHaveLength(5);
    expect(o2.view.enemyBoard.ships).toHaveLength(5);

    first.messages.length = 0;
    second.messages.length = 0;
    first.room.send('rematch', {});
    const status = await second.waitFor('rematch_status', (p) => p.requested.length === 1);
    expect(status.requested).toContain(first.room.sessionId);
    second.room.send('rematch', {});
    await second.waitFor('sync', (p) => p.view.phase === 'placement');
    expect(server.state.phase).toBe('placement');
  });

  it('private room rematch restarts placement and keeps both players connected', async () => {
    const host = record(await colyseus.sdk.create(ROOM_NAME, join('Alice', { private: true })));
    const server = colyseus.getRoomById<BattleRoom>(host.room.roomId);
    const res = await colyseus.http.get(`/rooms/code/${server.state.code}`);
    const guest = record(await colyseus.sdk.joinById(res.data.roomId, join('Bobby')));
    await host.waitFor('sync', (p) => p.view.phase === 'placement');
    await guest.waitFor('sync', (p) => p.view.phase === 'placement');

    host.room.send('forfeit', {});
    await host.waitFor('game_over');
    await guest.waitFor('game_over');
    host.room.send('rematch', {});
    await guest.waitFor('rematch_status', (p) => p.requested.length === 1);
    guest.room.send('rematch', {});
    await host.waitFor('sync', (p) => p.view.phase === 'placement');
    await guest.waitFor('sync', (p) => p.view.phase === 'placement');
    await sleep(300);
    expect(server.state.phase).toBe('placement');
    expect([...server.state.players.values()].every((p) => p.connected)).toBe(true);
    expect(server.clients.length).toBe(2);
  });

  it('a player leaving mid-battle loses', async () => {
    const { first, second } = await toBattle();
    await first.room.leave(true);
    const over = await second.waitFor('game_over');
    expect(over.youWon).toBe(true);
    expect(over.reason).toBe('forfeit');
  });

  it('rate-limits message floods', async () => {
    const { second } = await toBattle();
    for (let i = 0; i < 12; i++) second.room.send('fire', { x: 0, y: 0 });
    await second.waitFor('error', (p) => p.code === 'RATE_LIMITED');
  });

  it('emotes are broadcast', async () => {
    const { a, b } = await startMatch();
    a.room.send('emote', { id: 'salute' });
    const e = await b.waitFor('emote');
    expect(e).toEqual({ sessionId: a.room.sessionId, id: 'salute' });
  });
});

describe('reconnection', () => {
  it('pauses the turn timer and restores boards on reconnect', async () => {
    const { first, server } = await toBattle({ turnTimeMs: 2000 });
    const token = first.room.reconnectionToken;
    first.room.reconnection.enabled = false;
    first.room.connection.close();
    await sleep(150);
    const p = server.state.players.get(first.room.sessionId)!;
    expect(p.connected).toBe(false);
    expect(server.state.paused).toBe(true);

    const back = await colyseus.sdk.reconnect(token);
    const r = record(back);
    const fleet = await r.waitFor('your_fleet');
    const sync = await r.waitFor('sync');
    expect(fleet).toHaveLength(5);
    expect(sync.view.phase).toBe('battle');
    await sleep(50);
    expect(server.state.players.get(back.sessionId)!.connected).toBe(true);
    expect(server.state.paused).toBe(false);
  });

  it('forfeits by disconnect when the grace window expires', async () => {
    const { first, second } = await toBattle({ reconnectSeconds: 0.3 });
    first.room.reconnection.enabled = false;
    first.room.connection.close();
    const over = await second.waitFor('game_over', undefined, 5000);
    expect(over.reason).toBe('disconnect');
    expect(over.youWon).toBe(true);
  });
});
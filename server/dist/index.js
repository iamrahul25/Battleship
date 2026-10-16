// src/config.ts
import "dotenv/config";
var config = {
  port: Number(process.env.PORT ?? 2567),
  host: process.env.HOST ?? "0.0.0.0",
  nodeEnv: process.env.NODE_ENV ?? "development",
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  logLevel: process.env.LOG_LEVEL ?? "info",
  /** Seconds a dropped client may take to reconnect. */
  reconnectSeconds: Number(process.env.RECONNECT_SECONDS ?? 30),
  /** Close idle rooms nobody joined after this many ms. */
  idleRoomMs: Number(process.env.IDLE_ROOM_MS ?? 10 * 6e4)
};
var isDev = config.nodeEnv === "development";
var isTest = config.nodeEnv === "test" || process.env.VITEST !== void 0;

// src/app.ts
import { matchMaker, Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";

// src/rooms/BattleRoom.ts
import { Room, ServerError } from "@colyseus/core";

// src/services/logger.ts
import pino from "pino";
var logger = pino({
  level: isTest ? "silent" : config.logLevel,
  transport: isDev ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } } : void 0
});

// src/services/rateLimiter.ts
var RateLimiter = class {
  constructor(perSecond = 5, capacity = 5, now = Date.now) {
    this.perSecond = perSecond;
    this.capacity = capacity;
    this.now = now;
  }
  perSecond;
  capacity;
  now;
  buckets = /* @__PURE__ */ new Map();
  take(id, cost = 1) {
    const t2 = this.now();
    const b = this.buckets.get(id) ?? { tokens: this.capacity, last: t2 };
    b.tokens = Math.min(this.capacity, b.tokens + (t2 - b.last) / 1e3 * this.perSecond);
    b.last = t2;
    const ok = b.tokens >= cost;
    if (ok) b.tokens -= cost;
    this.buckets.set(id, b);
    return ok;
  }
  forget(id) {
    this.buckets.delete(id);
  }
};

// src/services/roomCodes.ts
import { randomInt } from "node:crypto";

// src/shared/protocol/index.ts
import { z } from "zod";
var PROTOCOL_VERSION = 1;
var ROOM_NAME = "battle";
var ClientMessage = {
  PlaceFleet: "place_fleet",
  Ready: "ready",
  Fire: "fire",
  UseWeapon: "use_weapon",
  Forfeit: "forfeit",
  Emote: "emote",
  Rematch: "rematch"
};
var ServerMessage = {
  Sync: "sync",
  ShotResult: "shot_result",
  YourFleet: "your_fleet",
  GameOver: "game_over",
  Error: "error",
  Emote: "emote",
  Rematch: "rematch_status"
};
var ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
var ROOM_CODE_LENGTH = 6;
var roomCodeSchema = z.string().transform((s) => s.trim().toUpperCase()).pipe(z.string().regex(new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`)));
var EMOTES = ["salute", "gg", "boom", "oops", "nice", "taunt"];
var gameModeSchema = z.enum(["classic", "arsenal"]);
var profileSchema = z.object({
  playerId: z.string().max(64).default(""),
  name: z.string().max(64).default("Sailor"),
  avatarId: z.string().max(32).default("captain"),
  wins: z.number().int().min(0).max(1e6).default(0),
  losses: z.number().int().min(0).max(1e6).default(0)
});
var joinOptionsSchema = z.object({
  protocolVersion: z.number().int(),
  mode: gameModeSchema.default("arsenal"),
  private: z.boolean().optional(),
  code: z.string().optional(),
  profile: profileSchema.default({ playerId: "", name: "Sailor", avatarId: "captain", wins: 0, losses: 0 })
});
var coordInt = z.number().int().min(0).max(63);
var rotationSchema = z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]);
var placeFleetSchema = z.object({
  ships: z.array(z.object({ defId: z.string().min(1).max(32), x: coordInt, y: coordInt, rotation: rotationSchema })).min(1).max(20)
});
var readySchema = z.object({}).passthrough().optional();
var fireSchema = z.object({ x: coordInt, y: coordInt });
var useWeaponSchema = z.object({
  weaponId: z.string().min(1).max(32),
  x: coordInt,
  y: coordInt,
  orientation: z.enum(["H", "V"]).optional()
});
var emoteSchema = z.object({ id: z.enum(EMOTES) });
var ERROR_MESSAGES = {
  PROTOCOL_MISMATCH: "Please update the app to play online.",
  INVALID_MESSAGE: "Invalid message.",
  RATE_LIMITED: "Slow down, Admiral!",
  ROOM_NOT_FOUND: "Room not found.",
  WRONG_PHASE: "Not allowed right now.",
  NOT_YOUR_TURN: "It's not your turn.",
  ALREADY_FIRED: "You already fired there.",
  OUT_OF_BOUNDS: "Target is outside the grid.",
  INVALID_PLACEMENT: "Invalid fleet placement.",
  FLEET_INCOMPLETE: "Place all your ships first.",
  ALREADY_READY: "Already ready.",
  WEAPON_NOT_READY: "Power-up not charged.",
  WEAPON_UNKNOWN: "Unknown power-up.",
  POWERUPS_DISABLED: "Power-ups are disabled in Classic mode."
};
var BANNED = ["fuck", "shit", "bitch", "cunt", "nigg", "fag", "dick", "pussy", "asshole", "whore", "slut", "rape"];
var NAME_MIN = 3;
var NAME_MAX = 16;
function sanitizeName(raw) {
  let name = raw.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  if (name.length > NAME_MAX) name = name.slice(0, NAME_MAX).trim();
  if (name.length < NAME_MIN) return null;
  const lower = name.toLowerCase();
  for (const word of BANNED) {
    let idx = lower.indexOf(word);
    while (idx !== -1) {
      name = name.slice(0, idx) + "*".repeat(word.length) + name.slice(idx + word.length);
      idx = lower.indexOf(word, idx + word.length);
    }
  }
  return name;
}

// src/services/roomCodes.ts
var codes = /* @__PURE__ */ new Map();
function generateRoomCode(random = randomInt) {
  for (let attempt = 0; attempt < 1e3; attempt++) {
    let code = "";
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[random(ROOM_CODE_ALPHABET.length)];
    if (!codes.has(code)) return code;
  }
  throw new Error("Room code space exhausted");
}
function registerRoomCode(code, roomId) {
  codes.set(code, roomId);
}
function unregisterRoomCode(code) {
  codes.delete(code);
}
function findRoomByCode(code) {
  return codes.get(code.trim().toUpperCase());
}

// src/shared/engine/config.ts
var line = (length) => Array.from({ length }, (_, x) => ({ x, y: 0 }));
var ship = (id, name, length, count = 1) => ({
  id,
  name,
  cells: line(length),
  count
});
var GridPresets = {
  small: { width: 8, height: 8 },
  medium: { width: 10, height: 10 },
  large: { width: 12, height: 12 },
  extraLarge: { width: 15, height: 15 }
};
var FleetPresets = {
  small: [ship("battleship", "Battleship", 4), ship("cruiser", "Cruiser", 3, 2), ship("destroyer", "Destroyer", 2)],
  medium: [
    ship("carrier", "Carrier", 5),
    ship("battleship", "Battleship", 4),
    ship("cruiser", "Cruiser", 3),
    ship("submarine", "Submarine", 3),
    ship("destroyer", "Destroyer", 2)
  ],
  large: [
    ship("carrier", "Carrier", 5),
    ship("battleship", "Battleship", 4, 2),
    ship("cruiser", "Cruiser", 3, 2),
    ship("destroyer", "Destroyer", 2, 2)
  ],
  extraLarge: [
    ship("dreadnought", "Dreadnought", 6),
    ship("carrier", "Carrier", 5),
    ship("battleship", "Battleship", 4, 2),
    ship("cruiser", "Cruiser", 3, 3),
    ship("destroyer", "Destroyer", 2, 3)
  ]
};
var CLASSIC_FLEET = FleetPresets.medium;
var ONLINE_TURN_TIME_MS = 3e4;
var ONLINE_PLACEMENT_TIME_MS = 6e4;
var MAX_CONSECUTIVE_TIMEOUTS = 3;
var CHARGE = {
  max: 100,
  perHit: 20,
  perSunk: 40,
  missStreakLength: 3,
  missStreakBonus: 10
};
var DEFAULT_RULES = {
  grid: { ...GridPresets.medium },
  fleet: CLASSIC_FLEET,
  allowTouching: false,
  bonusShotOnHit: true,
  powerUpsEnabled: true,
  turnTimeMs: null,
  placementTimeMs: null
};
function createRules(overrides = {}) {
  return {
    ...DEFAULT_RULES,
    ...overrides,
    grid: { ...overrides.grid ?? DEFAULT_RULES.grid },
    fleet: overrides.fleet ?? DEFAULT_RULES.fleet
  };
}
function rulesForMode(mode, overrides = {}) {
  return createRules({ powerUpsEnabled: mode === "arsenal", ...overrides });
}

// src/shared/engine/rng.ts
function createRng(seed) {
  let s = seed >>> 0;
  const next = () => {
    s = s + 1831565813 >>> 0;
    let t2 = s;
    t2 = Math.imul(t2 ^ t2 >>> 15, t2 | 1);
    t2 ^= t2 + Math.imul(t2 ^ t2 >>> 7, t2 | 61);
    return ((t2 ^ t2 >>> 14) >>> 0) / 4294967296;
  };
  const int = (max) => Math.floor(next() * max);
  return {
    next,
    int,
    pick: (items) => items[int(items.length)],
    shuffle: (items) => {
      for (let i = items.length - 1; i > 0; i--) {
        const j = int(i + 1);
        [items[i], items[j]] = [items[j], items[i]];
      }
      return items;
    },
    get state() {
      return s;
    }
  };
}
function randomSeed() {
  return Math.floor(Math.random() * 4294967295) >>> 0;
}

// src/shared/engine/board.ts
var key = (c) => `${c.x},${c.y}`;
function createBoard(width, height) {
  return { width, height, ships: [], shots: {} };
}
function inBounds(dims, c) {
  return Number.isInteger(c.x) && Number.isInteger(c.y) && c.x >= 0 && c.y >= 0 && c.x < dims.width && c.y < dims.height;
}
function cellAt(board, c) {
  return board.shots[key(c)] ?? "unknown";
}
var ORTHO = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 }
];
var ALL8 = [...ORTHO, { x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: -1, y: -1 }];
function neighbours8(dims, c) {
  return ALL8.map((d) => ({ x: c.x + d.x, y: c.y + d.y })).filter((n) => inBounds(dims, n));
}
function allCells(dims) {
  const out = [];
  for (let y = 0; y < dims.height; y++) for (let x = 0; x < dims.width; x++) out.push({ x, y });
  return out;
}
function isTargetable(board, c) {
  return cellAt(board, c) === "unknown";
}
function legalTargets(board) {
  return allCells(board).filter((c) => isTargetable(board, c));
}
function isShipSunk(ship2) {
  return ship2.hits >= ship2.cells.length;
}
function isFleetSunk(board) {
  return board.ships.length > 0 && board.ships.every(isShipSunk);
}
var sameCoord = (a, b) => a.x === b.x && a.y === b.y;
function cloneBoard(board) {
  return {
    width: board.width,
    height: board.height,
    ships: board.ships.map((s) => ({ ...s, origin: { ...s.origin }, cells: s.cells.map((c) => ({ ...c })) })),
    shots: { ...board.shots }
  };
}

// src/shared/engine/placement.ts
var ROTATIONS = [0, 90, 180, 270];
function rotateCell(c, rotation) {
  switch (rotation) {
    case 0:
      return { x: c.x, y: c.y };
    case 90:
      return { x: -c.y, y: c.x };
    case 180:
      return { x: -c.x, y: -c.y };
    case 270:
      return { x: c.y, y: -c.x };
  }
}
function shapeCells(def, rotation) {
  const rotated = def.cells.map((c) => rotateCell(c, rotation));
  const minX = Math.min(...rotated.map((c) => c.x));
  const minY = Math.min(...rotated.map((c) => c.y));
  return rotated.map((c) => ({ x: c.x - minX, y: c.y - minY }));
}
function shipCells(def, origin, rotation) {
  return shapeCells(def, rotation).map((c) => ({ x: c.x + origin.x, y: c.y + origin.y }));
}
function uniqueRotations(def) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const r of ROTATIONS) {
    const sig = shapeCells(def, r).map(key).sort().join("|");
    if (!seen.has(sig)) {
      seen.add(sig);
      out.push(r);
    }
  }
  return out;
}
function shapeSize(def, rotation) {
  const cells = shapeCells(def, rotation);
  return {
    width: Math.max(...cells.map((c) => c.x)) + 1,
    height: Math.max(...cells.map((c) => c.y)) + 1
  };
}
function blockedSets(board, rules, ignoreUid) {
  const occupied = /* @__PURE__ */ new Set();
  const halo = /* @__PURE__ */ new Set();
  for (const ship2 of board.ships) {
    if (ship2.uid === ignoreUid) continue;
    for (const c of ship2.cells) {
      occupied.add(key(c));
      if (!rules.allowTouching) for (const n of neighbours8(board, c)) halo.add(key(n));
    }
  }
  return { occupied, halo };
}
function placementError(board, def, origin, rotation, rules, ignoreUid) {
  const cells = shipCells(def, origin, rotation);
  if (!cells.every((c) => inBounds(board, c))) return "OUT_OF_BOUNDS";
  const { occupied, halo } = blockedSets(board, rules, ignoreUid);
  if (cells.some((c) => occupied.has(key(c)))) return "OVERLAP";
  if (cells.some((c) => halo.has(key(c)))) return "TOUCHING";
  return null;
}
function makePlacedShip(def, index, origin, rotation) {
  return {
    uid: `${def.id}#${index}`,
    defId: def.id,
    origin: { ...origin },
    rotation,
    cells: shipCells(def, origin, rotation),
    hits: 0
  };
}
function placeShip(board, ship2) {
  return { ...board, ships: [...board.ships.filter((s) => s.uid !== ship2.uid), ship2] };
}
function fleetInstances(rules) {
  const out = [];
  for (const def of rules.fleet) {
    for (let i = 0; i < def.count; i++) out.push({ uid: `${def.id}#${i}`, def, index: i });
  }
  return out.sort((a, b) => b.def.cells.length - a.def.cells.length);
}
function findDef(rules, defId) {
  return rules.fleet.find((d) => d.id === defId);
}
function validateFleet(rules, input) {
  const counts = /* @__PURE__ */ new Map();
  let board = createBoard(rules.grid.width, rules.grid.height);
  for (const item of input) {
    const def = findDef(rules, item.defId);
    if (!def) return { ok: false, reason: `Unknown ship ${item.defId}` };
    if (!ROTATIONS.includes(item.rotation)) return { ok: false, reason: "Bad rotation" };
    const index = counts.get(def.id) ?? 0;
    if (index >= def.count) return { ok: false, reason: `Too many ${def.id}` };
    counts.set(def.id, index + 1);
    const err = placementError(board, def, item.origin, item.rotation, rules);
    if (err) return { ok: false, reason: `${def.id}: ${err}` };
    board = placeShip(board, makePlacedShip(def, index, item.origin, item.rotation));
  }
  for (const def of rules.fleet) {
    if ((counts.get(def.id) ?? 0) !== def.count) return { ok: false, reason: `Missing ${def.id}` };
  }
  return { ok: true, ships: board.ships };
}
function placementCandidates(board, def, rules) {
  const { occupied, halo } = blockedSets(board, rules);
  const out = [];
  for (const rotation of uniqueRotations(def)) {
    const size = shapeSize(def, rotation);
    for (let y = 0; y + size.height <= board.height; y++) {
      for (let x = 0; x + size.width <= board.width; x++) {
        const cells = shipCells(def, { x, y }, rotation);
        if (cells.some((c) => occupied.has(key(c)) || halo.has(key(c)))) continue;
        out.push({ origin: { x, y }, rotation, cells });
      }
    }
  }
  return out;
}
function weightedPick(items, weights, rng) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng.next() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r < 0) return items[i];
  }
  return items[items.length - 1];
}
function randomFleet(rules, rng, options = {}) {
  const maxAttempts = options.maxAttempts ?? 500;
  const instances = fleetInstances(rules);
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let board = createBoard(rules.grid.width, rules.grid.height);
    let failed = false;
    for (const inst of instances) {
      const candidates = placementCandidates(board, inst.def, rules);
      if (candidates.length === 0) {
        failed = true;
        break;
      }
      const choice = options.weight ? weightedPick(
        candidates,
        candidates.map((c) => Math.max(1e-6, options.weight(c, board.ships, board))),
        rng
      ) : rng.pick(candidates);
      board = placeShip(board, makePlacedShip(inst.def, inst.index, choice.origin, choice.rotation));
    }
    if (!failed) return board.ships;
  }
  throw new Error("Unable to place fleet with current rules");
}
function isFleetComplete(board, rules) {
  return board.ships.length === fleetInstances(rules).length;
}

// src/shared/engine/attack.ts
function resolveShot(board, coord, rules) {
  const shots = { ...board.shots };
  const shipIndex = board.ships.findIndex((s) => s.cells.some((c) => sameCoord(c, coord)));
  if (shipIndex === -1) {
    shots[key(coord)] = "miss";
    return { board: { ...board, shots }, result: { coord, result: "miss" }, knownEmpty: [] };
  }
  const ships = board.ships.slice();
  const ship2 = { ...ships[shipIndex], hits: ships[shipIndex].hits + 1 };
  ships[shipIndex] = ship2;
  shots[key(coord)] = "hit";
  const knownEmpty = [];
  if (isShipSunk(ship2)) {
    for (const c of ship2.cells) shots[key(c)] = "sunk";
    if (!rules.allowTouching) {
      for (const c of ship2.cells) {
        for (const n of neighbours8(board, c)) {
          if (cellAt({ shots }, n) === "unknown") {
            shots[key(n)] = "knownEmpty";
            knownEmpty.push(n);
          }
        }
      }
    }
    return {
      board: { ...board, ships, shots },
      result: { coord, result: "sunk", shipUid: ship2.uid, ship: { ...ship2, cells: ship2.cells.map((c) => ({ ...c })) } },
      knownEmpty
    };
  }
  return { board: { ...board, ships, shots }, result: { coord, result: "hit", shipUid: ship2.uid }, knownEmpty };
}
function resolveSonar(board, area) {
  const inArea = area.filter((c) => inBounds(board, c));
  const shipCells2 = new Set(board.ships.flatMap((s) => s.cells.map(key)));
  return { area: inArea, shipCellsFound: inArea.filter((c) => shipCells2.has(key(c))).length };
}

// src/shared/engine/weapons.ts
var WEAPONS = {
  standard: {
    id: "standard",
    name: "Cannon",
    description: "Single shot.",
    cost: 0,
    maxUses: null,
    pattern: [{ x: 0, y: 0 }],
    kind: "damage",
    rotatable: false
  },
  artillery: {
    id: "artillery",
    name: "Heavy Artillery",
    description: "Strikes a plus-shaped 5-cell pattern.",
    cost: 100,
    maxUses: 2,
    pattern: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 }
    ],
    kind: "damage",
    rotatable: false
  },
  sonar: {
    id: "sonar",
    name: "Sonar Scan",
    description: "Reveals how many ship cells hide in a 3\xD73 area.",
    cost: 60,
    maxUses: null,
    pattern: [-1, 0, 1].flatMap((y) => [-1, 0, 1].map((x) => ({ x, y }))),
    kind: "reveal",
    rotatable: false
  }
};
function getWeapon(id) {
  return WEAPONS[id];
}
function patternCells(weapon, target, dims, orientation = "H") {
  return weapon.pattern.map((o) => weapon.rotatable && orientation === "V" ? { x: o.y, y: o.x } : o).map((o) => ({ x: target.x + o.x, y: target.y + o.y })).filter((c) => inBounds(dims, c));
}
function weaponUsesLeft(player, weapon) {
  if (weapon.maxUses === null) return Infinity;
  return Math.max(0, weapon.maxUses - (player.weaponUses[weapon.id] ?? 0));
}
function canUseWeapon(player, weapon, rules) {
  if (weapon.id === "standard") return true;
  if (!rules.powerUpsEnabled) return false;
  return player.charge >= weapon.cost && weaponUsesLeft(player, weapon) > 0;
}

// src/shared/engine/game.ts
var other = (p) => p === 0 ? 1 : 0;
function createPlayerState(rules) {
  return {
    board: createBoard(rules.grid.width, rules.grid.height),
    ready: false,
    charge: 0,
    weaponUses: {},
    missStreak: 0,
    consecutiveTimeouts: 0,
    shotsFired: 0,
    hits: 0,
    shipsSunk: 0,
    powerUpsUsed: 0
  };
}
function createGame(rules, seed) {
  return {
    rules,
    phase: "placement",
    players: [createPlayerState(rules), createPlayerState(rules)],
    activePlayer: 0,
    turnNumber: 0,
    winner: null,
    finishReason: null,
    log: [],
    rngState: seed >>> 0
  };
}
function startDraft(state) {
  return {
    state: {
      ...state,
      players: [{ ...state.players[0] }, { ...state.players[1] }],
      log: state.log.slice()
    },
    events: [],
    rng: createRng(state.rngState)
  };
}
function finishDraft(d, error) {
  return { state: { ...d.state, rngState: d.rng.state }, events: d.events, error };
}
var fail = (state, error) => ({ state, events: [], error });
function setPlayer(d, idx, patch) {
  d.state.players[idx] = { ...d.state.players[idx], ...patch };
}
function endGame(d, winner, reason) {
  d.state.phase = "finished";
  d.state.winner = winner;
  d.state.finishReason = reason;
  d.events.push({ type: "gameOver", winner, reason });
}
function markReady(d, player) {
  setPlayer(d, player, { ready: true });
  d.events.push({ type: "ready", player });
  if (d.state.players[0].ready && d.state.players[1].ready) {
    const first = d.rng.int(2);
    d.state.phase = "battle";
    d.state.activePlayer = first;
    d.state.turnNumber = 1;
    d.events.push({ type: "battleStart", firstPlayer: first });
  }
}
function addCharge(p, amount) {
  return Math.min(CHARGE.max, p.charge + amount);
}
function pushShot(d, shot) {
  const ev = { ...shot, turnNumber: d.state.turnNumber };
  d.state.log.push(ev);
  d.events.push({ type: "shot", shot: ev });
  const defender = other(shot.by);
  if (isFleetSunk(d.state.players[defender].board)) {
    endGame(d, shot.by, "sunk");
    ev.turnPassed = false;
    return;
  }
  if (ev.turnPassed) {
    d.state.activePlayer = defender;
    d.state.turnNumber += 1;
  }
}
function fireStandard(d, player, target, auto) {
  const defender = other(player);
  const resolved = resolveShot(d.state.players[defender].board, target, d.state.rules);
  setPlayer(d, defender, { board: resolved.board });
  const attacker = d.state.players[player];
  const isHit = resolved.result.result !== "miss";
  const patch = {
    shotsFired: attacker.shotsFired + 1,
    hits: attacker.hits + (isHit ? 1 : 0),
    shipsSunk: attacker.shipsSunk + (resolved.result.result === "sunk" ? 1 : 0),
    consecutiveTimeouts: auto ? attacker.consecutiveTimeouts : 0
  };
  if (d.state.rules.powerUpsEnabled) {
    if (isHit) {
      patch.missStreak = 0;
      patch.charge = addCharge(attacker, CHARGE.perHit + (resolved.result.result === "sunk" ? CHARGE.perSunk : 0));
    } else {
      const streak = attacker.missStreak + 1;
      patch.missStreak = streak;
      if (streak % CHARGE.missStreakLength === 0) patch.charge = addCharge(attacker, CHARGE.missStreakBonus);
    }
  }
  setPlayer(d, player, patch);
  pushShot(d, {
    by: player,
    weaponId: "standard",
    target,
    results: [resolved.result],
    knownEmpty: resolved.knownEmpty.length ? resolved.knownEmpty : void 0,
    turnPassed: !isHit || !d.state.rules.bonusShotOnHit,
    auto: auto || void 0
  });
}
function checkTurn(state, player) {
  if (state.phase !== "battle") return "WRONG_PHASE";
  if (state.activePlayer !== player) return "NOT_YOUR_TURN";
  return null;
}
function applyAction(state, action) {
  switch (action.type) {
    case "PLACE_FLEET": {
      if (state.phase !== "placement") return fail(state, "WRONG_PHASE");
      const p = state.players[action.player];
      if (p.ready) return fail(state, "ALREADY_READY");
      const v = validateFleet(
        state.rules,
        action.ships.map((s) => ({ defId: s.defId, origin: s.origin, rotation: s.rotation }))
      );
      if (!v.ok) return fail(state, "INVALID_PLACEMENT");
      const d = startDraft(state);
      setPlayer(d, action.player, { board: { ...createBoard(state.rules.grid.width, state.rules.grid.height), ships: v.ships } });
      d.events.push({ type: "fleetPlaced", player: action.player });
      return finishDraft(d);
    }
    case "READY": {
      if (state.phase !== "placement") return fail(state, "WRONG_PHASE");
      const p = state.players[action.player];
      if (p.ready) return fail(state, "ALREADY_READY");
      if (!isFleetComplete(p.board, state.rules)) return fail(state, "FLEET_INCOMPLETE");
      const d = startDraft(state);
      markReady(d, action.player);
      return finishDraft(d);
    }
    case "FIRE": {
      const err = checkTurn(state, action.player);
      if (err) return fail(state, err);
      const board = state.players[other(action.player)].board;
      if (!inBounds(board, action.target)) return fail(state, "OUT_OF_BOUNDS");
      if (!isTargetable(board, action.target)) return fail(state, "ALREADY_FIRED");
      const d = startDraft(state);
      fireStandard(d, action.player, action.target, false);
      return finishDraft(d);
    }
    case "USE_WEAPON": {
      const err = checkTurn(state, action.player);
      if (err) return fail(state, err);
      const weapon = getWeapon(action.weaponId);
      if (!weapon) return fail(state, "WEAPON_UNKNOWN");
      if (weapon.id === "standard") return applyAction(state, { type: "FIRE", player: action.player, target: action.target });
      if (!state.rules.powerUpsEnabled) return fail(state, "POWERUPS_DISABLED");
      const attacker = state.players[action.player];
      if (!canUseWeapon(attacker, weapon, state.rules)) return fail(state, "WEAPON_NOT_READY");
      const defenderIdx = other(action.player);
      const board = state.players[defenderIdx].board;
      if (!inBounds(board, action.target)) return fail(state, "OUT_OF_BOUNDS");
      const area = patternCells(weapon, action.target, board, action.orientation);
      const d = startDraft(state);
      const usage = {
        charge: attacker.charge - weapon.cost,
        weaponUses: { ...attacker.weaponUses, [weapon.id]: (attacker.weaponUses[weapon.id] ?? 0) + 1 },
        powerUpsUsed: attacker.powerUpsUsed + 1,
        consecutiveTimeouts: 0
      };
      if (weapon.kind === "reveal") {
        setPlayer(d, action.player, usage);
        pushShot(d, {
          by: action.player,
          weaponId: weapon.id,
          target: action.target,
          results: [],
          sonar: resolveSonar(board, area),
          turnPassed: true
        });
        return finishDraft(d);
      }
      const targets = area.filter((c) => isTargetable(board, c));
      if (targets.length === 0) return fail(state, "ALREADY_FIRED");
      let current = board;
      const results = [];
      const knownEmpty = [];
      for (const c of targets) {
        if (!isTargetable(current, c)) continue;
        const r = resolveShot(current, c, state.rules);
        current = r.board;
        results.push(r.result);
        knownEmpty.push(...r.knownEmpty);
      }
      const hits = results.filter((r) => r.result !== "miss").length;
      setPlayer(d, defenderIdx, { board: current });
      setPlayer(d, action.player, {
        ...usage,
        shotsFired: attacker.shotsFired + results.length,
        hits: attacker.hits + hits,
        shipsSunk: attacker.shipsSunk + results.filter((r) => r.result === "sunk").length
      });
      pushShot(d, {
        by: action.player,
        weaponId: weapon.id,
        target: action.target,
        results,
        knownEmpty: knownEmpty.length ? knownEmpty : void 0,
        turnPassed: true
      });
      return finishDraft(d);
    }
    case "TIMEOUT": {
      if (state.phase === "placement") {
        const p = state.players[action.player];
        if (p.ready) return fail(state, "ALREADY_READY");
        const d2 = startDraft(state);
        if (!isFleetComplete(p.board, state.rules)) {
          const ships = randomFleet(state.rules, d2.rng);
          setPlayer(d2, action.player, { board: { ...createBoard(state.rules.grid.width, state.rules.grid.height), ships } });
          d2.events.push({ type: "fleetPlaced", player: action.player });
        }
        markReady(d2, action.player);
        return finishDraft(d2);
      }
      const err = checkTurn(state, action.player);
      if (err) return fail(state, err);
      const d = startDraft(state);
      const timeouts = state.players[action.player].consecutiveTimeouts + 1;
      setPlayer(d, action.player, { consecutiveTimeouts: timeouts });
      if (timeouts >= MAX_CONSECUTIVE_TIMEOUTS) {
        endGame(d, other(action.player), "timeout");
        return finishDraft(d);
      }
      const targets = legalTargets(state.players[other(action.player)].board);
      fireStandard(d, action.player, d.rng.pick(targets), true);
      return finishDraft(d);
    }
    case "FORFEIT": {
      if (state.phase === "finished") return fail(state, "WRONG_PHASE");
      const d = startDraft(state);
      endGame(d, other(action.player), action.reason ?? "forfeit");
      return finishDraft(d);
    }
  }
}
function redactBoard(board, reveal) {
  const ships = reveal ? board.ships : board.ships.filter(isShipSunk);
  return {
    width: board.width,
    height: board.height,
    shots: { ...board.shots },
    ships: ships.map((s) => ({ ...s, origin: { ...s.origin }, cells: s.cells.map((c) => ({ ...c })) }))
  };
}
function redactShotEvent(event, viewer) {
  if (event.by !== viewer) return event;
  return {
    ...event,
    results: event.results.map((r) => r.result === "hit" ? { coord: r.coord, result: "hit" } : r)
  };
}
function publicInfo(p) {
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
    powerUpsUsed: p.powerUpsUsed
  };
}
function getPublicView(state, viewer) {
  const enemyIdx = other(viewer);
  const finished = state.phase === "finished";
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
    log: finished ? state.log.slice() : state.log.map((e) => redactShotEvent(e, viewer))
  };
}

// src/rooms/schema/BattleState.ts
import { schema, t } from "@colyseus/schema";
var PlayerPublic = schema(
  {
    sessionId: t.string().default(""),
    seat: t.number().default(0),
    name: t.string().default(""),
    avatarId: t.string().default("captain"),
    /** Self-reported in MVP (display only). */
    wins: t.number().default(0),
    losses: t.number().default(0),
    ready: t.boolean().default(false),
    connected: t.boolean().default(true),
    /** Epoch ms when the reconnection window closes (0 when connected). */
    reconnectDeadline: t.number().default(0),
    charge: t.number().default(0),
    /** defIds of ships this player has lost. */
    shipsSunk: t.array("string"),
    wantsRematch: t.boolean().default(false)
  },
  "PlayerPublic"
);
var BattleState = schema(
  {
    /** waiting | placement | battle | finished */
    phase: t.string().default("waiting"),
    players: t.map(PlayerPublic),
    activeSessionId: t.string().default(""),
    /** Server epoch ms for the current turn/placement deadline (0 = none). */
    turnDeadline: t.number().default(0),
    /** True while the active player is disconnected and the turn timer is frozen. */
    paused: t.boolean().default(false),
    turnNumber: t.number().default(0),
    winnerSessionId: t.string().default(""),
    finishReason: t.string().default(""),
    mode: t.string().default("arsenal"),
    code: t.string().default(""),
    isPrivate: t.boolean().default(false)
  },
  "BattleState"
);

// src/rooms/BattleRoom.ts
var BattleRoom = class extends Room {
  maxClients = 2;
  maxMessagesPerSecond = 30;
  game = null;
  rules;
  seats = [];
  turnTimer = null;
  pausedRemainingMs = null;
  idleTimer = null;
  limiter = new RateLimiter(5, 5);
  emoteLimiter = new RateLimiter(0.5, 2);
  reconnectSeconds = config.reconnectSeconds;
  seed;
  onCreate(options) {
    const mode = options.mode === "classic" ? "classic" : "arsenal";
    const hooks = isTest ? options : {};
    this.rules = rulesForMode(mode, {
      turnTimeMs: hooks.turnTimeMs ?? ONLINE_TURN_TIME_MS,
      placementTimeMs: hooks.placementTimeMs ?? ONLINE_PLACEMENT_TIME_MS
    });
    this.reconnectSeconds = hooks.reconnectSeconds ?? config.reconnectSeconds;
    this.seed = hooks.seed;
    this.state = new BattleState();
    this.state.mode = mode;
    if (options.private) {
      const code = generateRoomCode();
      this.state.code = code;
      this.state.isPrivate = true;
      registerRoomCode(code, this.roomId);
      this.setPrivate(true);
    }
    this.setMetadata({ mode, code: this.state.code });
    this.idleTimer = this.clock.setTimeout(() => {
      if (this.state.phase === "waiting") this.disconnect();
    }, config.idleRoomMs);
    this.onMessage(
      ClientMessage.PlaceFleet,
      (client, raw) => this.guarded(client, placeFleetSchema, raw, (msg, seat) => {
        const ok = this.dispatch(
          {
            type: "PLACE_FLEET",
            player: seat.index,
            ships: msg.ships.map((s) => ({
              uid: "",
              defId: s.defId,
              origin: { x: s.x, y: s.y },
              rotation: s.rotation,
              cells: [],
              hits: 0
            }))
          },
          client
        );
        if (ok) client.send(ServerMessage.YourFleet, this.game.players[seat.index].board.ships);
      })
    );
    this.onMessage(
      ClientMessage.Ready,
      (client) => this.guarded(client, null, {}, (_msg, seat) => this.dispatch({ type: "READY", player: seat.index }, client))
    );
    this.onMessage(
      ClientMessage.Fire,
      (client, raw) => this.guarded(
        client,
        fireSchema,
        raw,
        (msg, seat) => this.dispatch({ type: "FIRE", player: seat.index, target: { x: msg.x, y: msg.y } }, client)
      )
    );
    this.onMessage(
      ClientMessage.UseWeapon,
      (client, raw) => this.guarded(
        client,
        useWeaponSchema,
        raw,
        (msg, seat) => this.dispatch(
          {
            type: "USE_WEAPON",
            player: seat.index,
            weaponId: msg.weaponId,
            target: { x: msg.x, y: msg.y },
            orientation: msg.orientation
          },
          client
        )
      )
    );
    this.onMessage(
      ClientMessage.Forfeit,
      (client) => this.guarded(client, null, {}, (_msg, seat) => this.dispatch({ type: "FORFEIT", player: seat.index }, client))
    );
    this.onMessage(ClientMessage.Emote, (client, raw) => {
      const parsed = emoteSchema.safeParse(raw);
      if (!parsed.success || !this.emoteLimiter.take(client.sessionId)) return;
      this.broadcast(ServerMessage.Emote, { sessionId: client.sessionId, id: parsed.data.id });
    });
    this.onMessage(ClientMessage.Rematch, (client) => this.guarded(client, null, {}, () => this.voteRematch(client)));
  }
  onAuth(_client, options) {
    const parsed = joinOptionsSchema.safeParse(options);
    if (!parsed.success) throw new ServerError(4400, "INVALID_MESSAGE");
    if (parsed.data.protocolVersion !== PROTOCOL_VERSION) throw new ServerError(4426, "PROTOCOL_MISMATCH");
    return true;
  }
  onJoin(client, options) {
    const parsed = joinOptionsSchema.parse(options);
    const profile = {
      ...parsed.profile,
      name: sanitizeName(parsed.profile.name) ?? `Sailor${Math.floor(Math.random() * 900 + 100)}`
    };
    const index = this.seats.some((s) => s.index === 0) ? 1 : 0;
    this.seats.push({ sessionId: client.sessionId, index, profile });
    const p = new PlayerPublic();
    p.sessionId = client.sessionId;
    p.seat = index;
    p.name = profile.name;
    p.avatarId = profile.avatarId;
    p.wins = profile.wins;
    p.losses = profile.losses;
    this.state.players.set(client.sessionId, p);
    logger.info({ room: this.roomId, session: client.sessionId, name: profile.name }, "player joined");
    if (this.seats.length === 2) this.startMatch();
  }
  onDrop(client) {
    const seat = this.seatOf(client.sessionId);
    if (!seat || this.state.phase === "finished") return;
    const p = this.state.players.get(client.sessionId);
    if (p) {
      p.connected = false;
      p.reconnectDeadline = Date.now() + this.reconnectSeconds * 1e3;
    }
    if (this.state.phase === "battle" && this.game && this.game.activePlayer === seat.index) this.pauseTurnTimer();
    logger.info({ room: this.roomId, session: client.sessionId }, "player dropped, awaiting reconnection");
    this.allowReconnection(client, this.reconnectSeconds);
  }
  onReconnect(client) {
    const p = this.state.players.get(client.sessionId);
    if (p) {
      p.connected = true;
      p.reconnectDeadline = 0;
    }
    if (this.pausedRemainingMs !== null) this.resumeTurnTimer();
    const seat = this.seatOf(client.sessionId);
    if (seat && this.game) {
      client.send(ServerMessage.YourFleet, this.game.players[seat.index].board.ships);
      client.send(ServerMessage.Sync, { view: getPublicView(this.game, seat.index) });
    }
    logger.info({ room: this.roomId, session: client.sessionId }, "player reconnected");
  }
  onLeave(client) {
    const seat = this.seatOf(client.sessionId);
    this.limiter.forget(client.sessionId);
    if (!seat) return;
    const p = this.state.players.get(client.sessionId);
    const consented = p?.connected !== false;
    if (this.state.phase === "waiting") {
      this.seats = this.seats.filter((s) => s.sessionId !== client.sessionId);
      this.state.players.delete(client.sessionId);
      return;
    }
    if (p) {
      p.connected = false;
      p.reconnectDeadline = 0;
      p.wantsRematch = false;
    }
    if (this.game && (this.state.phase === "placement" || this.state.phase === "battle")) {
      this.dispatch({ type: "FORFEIT", player: seat.index, reason: consented ? "forfeit" : "disconnect" });
    }
    this.broadcastRematchStatus();
  }
  onDispose() {
    if (this.state.code) unregisterRoomCode(this.state.code);
    logger.info({ room: this.roomId }, "room disposed");
  }
  // ---- helpers ----
  seatOf(sessionId) {
    return this.seats.find((s) => s.sessionId === sessionId);
  }
  sessionOf(index) {
    return this.seats.find((s) => s.index === index)?.sessionId ?? "";
  }
  sendError(client, code) {
    client.send(ServerMessage.Error, { code, message: ERROR_MESSAGES[code] ?? code });
  }
  guarded(client, schema2, raw, handler) {
    if (!this.limiter.take(client.sessionId)) return this.sendError(client, "RATE_LIMITED");
    const seat = this.seatOf(client.sessionId);
    if (!seat || !this.game) return this.sendError(client, "WRONG_PHASE");
    let msg = raw;
    if (schema2) {
      const parsed = schema2.safeParse(raw);
      if (!parsed.success) return this.sendError(client, "INVALID_MESSAGE");
      msg = parsed.data;
    }
    handler(msg, seat);
  }
  startMatch() {
    this.idleTimer?.clear();
    this.lock();
    this.newGame();
  }
  newGame() {
    this.game = createGame(this.rules, this.seed ?? randomSeed());
    this.state.phase = "placement";
    this.state.winnerSessionId = "";
    this.state.finishReason = "";
    this.state.activeSessionId = "";
    this.state.turnNumber = 0;
    this.state.paused = false;
    this.state.players.forEach((p) => {
      p.ready = false;
      p.charge = 0;
      p.shipsSunk.clear();
      p.wantsRematch = false;
    });
    this.sendSyncToAll();
    this.startTimer(this.rules.placementTimeMs ?? ONLINE_PLACEMENT_TIME_MS, () => {
      for (const seat of this.seats) {
        if (this.game && this.game.phase === "placement" && !this.game.players[seat.index].ready) {
          this.dispatch({ type: "TIMEOUT", player: seat.index });
          const client = this.clients.getById(seat.sessionId);
          if (client && this.game) client.send(ServerMessage.YourFleet, this.game.players[seat.index].board.ships);
        }
      }
    });
  }
  startTimer(ms, onExpire) {
    this.turnTimer?.clear();
    this.pausedRemainingMs = null;
    this.state.paused = false;
    this.state.turnDeadline = Date.now() + ms;
    this.turnTimer = this.clock.setTimeout(onExpire, ms);
  }
  clearTimer() {
    this.turnTimer?.clear();
    this.turnTimer = null;
    this.state.turnDeadline = 0;
  }
  startTurnTimer() {
    if (!this.game || this.game.phase !== "battle") return;
    const active = this.game.activePlayer;
    const activeSession = this.sessionOf(active);
    if (this.state.players.get(activeSession)?.connected === false) {
      this.clearTimer();
      this.pausedRemainingMs = this.rules.turnTimeMs ?? ONLINE_TURN_TIME_MS;
      this.state.paused = true;
      return;
    }
    this.startTimer(this.rules.turnTimeMs ?? ONLINE_TURN_TIME_MS, () => this.onTurnTimeout(active));
  }
  onTurnTimeout(player) {
    if (!this.game || this.game.phase !== "battle" || this.game.activePlayer !== player) return;
    this.dispatch({ type: "TIMEOUT", player });
  }
  pauseTurnTimer() {
    if (!this.turnTimer || this.state.phase !== "battle") return;
    this.pausedRemainingMs = Math.max(1e3, this.state.turnDeadline - Date.now());
    this.turnTimer.clear();
    this.turnTimer = null;
    this.state.paused = true;
  }
  resumeTurnTimer() {
    if (!this.game || this.game.phase !== "battle" || this.pausedRemainingMs === null) return;
    const active = this.game.activePlayer;
    this.startTimer(this.pausedRemainingMs, () => this.onTurnTimeout(active));
  }
  /** Applies an action through the engine and fans out results. Returns false on rejection. */
  dispatch(action, client) {
    if (!this.game) return false;
    const res = applyActionSafe(this.game, action);
    if (res.error) {
      if (client) this.sendError(client, res.error);
      return false;
    }
    this.game = res.state;
    this.syncSchema();
    let sentShot = false;
    let battleStarted = false;
    let over = null;
    for (const ev of res.events) {
      if (ev.type === "shot") {
        sentShot = true;
        for (const seat of this.seats) {
          const c = this.clients.getById(seat.sessionId);
          c?.send(ServerMessage.ShotResult, {
            event: redactShotEvent(ev.shot, seat.index),
            view: getPublicView(this.game, seat.index)
          });
        }
      } else if (ev.type === "battleStart") battleStarted = true;
      else if (ev.type === "gameOver") over = ev;
    }
    if (!sentShot) this.sendSyncToAll();
    if (over) this.finish(over.winner, over.reason);
    else if (battleStarted || sentShot && this.game.phase === "battle") this.startTurnTimer();
    return true;
  }
  finish(winner, reason) {
    this.clearTimer();
    this.pausedRemainingMs = null;
    this.state.paused = false;
    this.state.winnerSessionId = this.sessionOf(winner);
    this.state.finishReason = reason;
    for (const seat of this.seats) {
      const c = this.clients.getById(seat.sessionId);
      if (!c || !this.game) continue;
      c.send(ServerMessage.GameOver, {
        winnerSessionId: this.sessionOf(winner),
        youWon: seat.index === winner,
        reason,
        revealFleet: this.game.players[other(seat.index)].board.ships,
        view: getPublicView(this.game, seat.index)
      });
    }
    logger.info({ room: this.roomId, winner: this.sessionOf(winner), reason }, "game over");
  }
  syncSchema() {
    if (!this.game) return;
    const g = this.game;
    this.state.phase = g.phase;
    this.state.turnNumber = g.turnNumber;
    this.state.activeSessionId = g.phase === "battle" ? this.sessionOf(g.activePlayer) : "";
    for (const seat of this.seats) {
      const p = this.state.players.get(seat.sessionId);
      if (!p) continue;
      const ps = g.players[seat.index];
      p.ready = ps.ready;
      p.charge = ps.charge;
      const lost = ps.board.ships.filter((s) => s.hits >= s.cells.length).map((s) => s.defId);
      if (lost.length !== p.shipsSunk.length) {
        p.shipsSunk.clear();
        lost.forEach((id) => p.shipsSunk.push(id));
      }
    }
  }
  sendSyncToAll() {
    if (!this.game) return;
    for (const seat of this.seats) {
      this.clients.getById(seat.sessionId)?.send(ServerMessage.Sync, { view: getPublicView(this.game, seat.index) });
    }
  }
  voteRematch(client) {
    if (this.state.phase !== "finished") return this.sendError(client, "WRONG_PHASE");
    const p = this.state.players.get(client.sessionId);
    if (p) p.wantsRematch = true;
    this.broadcastRematchStatus();
    const all = this.seats.every((s) => {
      const pp = this.state.players.get(s.sessionId);
      return pp?.wantsRematch && pp.connected;
    });
    if (all && this.seats.length === 2) this.newGame();
  }
  broadcastRematchStatus() {
    const requested = [];
    this.state.players.forEach((p, id) => {
      if (p.wantsRematch) requested.push(id);
    });
    this.broadcast(ServerMessage.Rematch, { requested });
  }
};
function applyActionSafe(state, action) {
  try {
    return applyAction(state, action);
  } catch (err) {
    logger.error({ err, action: action.type }, "engine error");
    return { state, events: [], error: "WRONG_PHASE" };
  }
}

// src/app.ts
function cors(req, res, next) {
  const allowed = config.corsOrigin.split(",").map((s) => s.trim());
  const origin = req.headers.origin;
  if (allowed.includes("*")) res.setHeader("Access-Control-Allow-Origin", "*");
  else if (origin && allowed.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return void res.sendStatus(204);
  next();
}
async function configureRoutes(app, withMonitor) {
  app.use("/health", cors);
  app.use("/rooms", cors);
  app.get("/health", async (_req, res) => {
    const rooms = await matchMaker.query({ name: ROOM_NAME });
    res.json({ ok: true, protocolVersion: PROTOCOL_VERSION, uptime: process.uptime(), rooms: rooms.length });
  });
  app.get("/rooms/code/:code", (req, res) => {
    const parsed = roomCodeSchema.safeParse(req.params.code);
    const roomId = parsed.success ? findRoomByCode(parsed.data) : void 0;
    if (!roomId) return void res.status(404).json({ code: "ROOM_NOT_FOUND", message: "Room not found." });
    res.json({ roomId });
  });
  if (withMonitor) {
    const { monitor } = await import("@colyseus/monitor");
    app.use("/colyseus", monitor());
  }
}
function createGameServer(options = {}) {
  const server2 = new Server({
    transport: new WebSocketTransport(),
    greet: options.greet ?? false,
    gracefullyShutdown: options.gracefullyShutdown ?? true,
    express: (app) => configureRoutes(app, options.withMonitor ?? false)
  });
  server2.define(ROOM_NAME, BattleRoom).filterBy(["mode"]);
  return server2;
}

// src/index.ts
var server = createGameServer({ withMonitor: isDev });
await server.listen(config.port, config.host);
logger.info(`Battleship server listening on ws://${config.host}:${config.port}`);
if (isDev) logger.info(`Colyseus monitor: http://localhost:${config.port}/colyseus`);
//# sourceMappingURL=index.js.map

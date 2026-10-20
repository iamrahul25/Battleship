# Battleship — Project Plan

> Status: **Planning only.** Nothing in this document has been implemented yet.
> Target: an attractive, simple **2D** naval combat game for Android (APK first), with
> offline play vs. bot (Easy / Medium / Hard) and online 1v1 multiplayer.

---

## Table of Contents

1. [Product Vision](#1-product-vision)
2. [Scope: MVP vs. Future](#2-scope-mvp-vs-future)
3. [Assumptions & Open Questions](#3-assumptions--open-questions)
4. [Tech Stack](#4-tech-stack)
5. [Repository Structure (`server/` + `app/`)](#5-repository-structure-server--app)
6. [Game Rules (MVP)](#6-game-rules-mvp)
7. [Shared Game Engine (`server/src/shared/engine`)](#7-shared-game-engine-serversrcsharedengine)
8. [Bot AI (Easy / Medium / Hard)](#8-bot-ai-easy--medium--hard)
9. [Power-ups & Heavy Artillery](#9-power-ups--heavy-artillery)
10. [Online Multiplayer (Colyseus Server)](#10-online-multiplayer-colyseus-server)
11. [App Architecture (Android + Web)](#11-app-architecture-android--web)
12. [Screens & User Flows](#12-screens--user-flows)
13. [Visual Design System](#13-visual-design-system)
14. [Animations](#14-animations)
15. [Sound & Haptics](#15-sound--haptics)
16. [Player Profile, Stats, Badges & Medals](#16-player-profile-stats-badges--medals)
17. [Persistence & Data](#17-persistence--data)
18. [Testing Strategy](#18-testing-strategy)
19. [Build, Deployment & Release](#19-build-deployment--release)
20. [Performance Budget](#20-performance-budget)
21. [Milestones & Task Breakdown](#21-milestones--task-breakdown)
22. [Future Features (Post-MVP) Design Notes](#22-future-features-post-mvp-design-notes)
23. [Risks & Mitigations](#23-risks--mitigations)
24. [Definition of Done (MVP)](#24-definition-of-done-mvp)
25. [Expansion v2: Sizes, Shapes, Obstacles, Weapons](#25-expansion-v2-sizes-shapes-obstacles-weapons)

---

## 1. Product Vision

A naval combat strategy game where two admirals hide fleets on a grid and take turns
firing at each other's waters. The first to sink the entire enemy fleet wins.

**Pillars**

| Pillar | What it means in practice |
|---|---|
| Simple | Classic rules, 2D top-down grid, one-tap firing, no clutter. |
| Satisfying | Every shot gets feedback: shell flight, splash or explosion, screen shake, sound, haptic. |
| Tactical | Turn timer, fleet tracker, power-ups (Heavy Artillery, Sonar) add decisions. |
| Social | Online 1v1, private room codes, profiles with avatars, win/loss stats, medals. |
| Military theme | Dark navy + steel UI, warship illustrations, stencil fonts, radar/sonar motifs. |

**Feature map from the promotional screenshots**

1. Grid-based naval combat — red hit markers, X miss markers, remaining-targets tracker.
2. Turn-based multiplayer — turn timer, whose-turn indicator, remaining fleet info.
3. Realistic combat effects — explosions, impact animations, warship art, hit vs. miss feedback.
4. Power-ups & heavy artillery — special abilities, badges, medals, rewards.
5. Player profiles & stats — names, avatars, win/loss, remaining fleet, battle status.

---

## 2. Scope: MVP vs. Future

### MVP (this plan)

- Classic 10×10 grid, classic 5-ship fleet.
- Ship placement screen: drag, rotate, randomize, clear, confirm.
- **Offline vs. Bot**: Easy, Medium, Hard.
- **Online 1v1** via Colyseus: Quick Match (matchmaking) + Private Room (6-char code).
- Turn timer (online and optional offline).
- Two power-ups: **Heavy Artillery** and **Sonar Scan**, earned through a charge meter.
  Toggleable game mode: *Classic* (no power-ups) vs. *Arsenal* (power-ups on).
- Hit / miss / sunk animations, explosion effects, screen shake, sounds, haptics.
- Player profile: name, avatar (preset list), stats (wins, losses, accuracy, streak).
- Badges & medals (local, ~12 achievements).
- Settings: sound, music, haptics, timer on/off (offline), language placeholder (English only).
- Android APK build via EAS.

### Future (designed for, not built)

- Custom grid sizes: **Small (8×8), Medium (10×10), Large (12×12), Extra Large (15×15)**.
- Different ship shapes and sizes (L-shape, T-shape, 2×2 etc.).
- More weapons / power-ups (Torpedo, Airstrike, Cluster Bomb, Shield, Decoy).
- Accounts & cloud sync, global leaderboard, friends list, rematch history.
- iOS build, chat/emotes, seasonal events, cosmetics (ship skins, grid themes).

> Architecture rule: **grid size, ship definitions, and weapons are data, not code**, so
> future features are configuration changes plus UI, not engine rewrites (see §7, §22).

---

## 3. Assumptions & Open Questions

These are decisions I made so the plan is complete. Each one is easy to change — tell me
if you want something different.

| # | Decision (assumed) | Alternatives |
|---|---|---|
| A1 | **Guest-only identity** for MVP: device generates a UUID + chosen nickname. No login. | Google sign-in, email accounts. |
| A2 | Stats are stored **locally** (AsyncStorage). Online matches also report to server, but server stores nothing persistent in MVP. | Server DB (Postgres/SQLite) for cross-device stats & leaderboards. |
| A3 | **Turn rule: alternate turns** after every shot (hit or miss). A game-setup option "Bonus shot on hit" is available. | Hit always grants another shot (common in mobile versions). |
| A4 | Turn timer = **30 s** online. On timeout, the server fires a random valid shot for the player. 3 consecutive timeouts = forfeit. | Skip turn instead of auto-shot; different durations. |
| A5 | Ships **cannot touch** each other (not even diagonally) — classic rule, makes Hard bot smarter. Toggle "Allow touching ships". | Allow touching by default. |
| A6 | Ship placement has a **60 s** timer online; when it expires the fleet is auto-randomized. | No timer. |
| A7 | One Expo app targets **Android + Web**, portrait layout (web is centered in a phone-width column on desktop). | Landscape support, iOS. |
| A8 | Art: original/free-license 2D assets (Kenney.nl, OpenGameArt, or generated), sounds from freesound.org / Kenney (CC0). | Commissioned art. |
| A9 | Server hosted on a small Node host (Fly.io / Render / Railway) with WebSocket support. | Colyseus Cloud, VPS. |
| A10 | No ads, no in-app purchases in MVP. | Rewarded ads for power-ups later. |

**Questions for you**

1. Should a hit give the attacker another shot by default (A3)?
2. Do you want login / cloud stats in MVP or is guest + local stats OK (A1, A2)?
3. Any preferred game name, logo, or color direction (current plan: dark navy + steel + signal red)?
4. Where do you want to host the server (A9)?
5. Should power-ups be on by default (Arsenal mode) or off (Classic mode)?

---

## 4. Tech Stack

| Layer | Choice | Purpose |
|---|---|---|
| App (Android + Web) | **React Native + Expo (SDK latest) + TypeScript**, web via **react-native-web** (`expo start --web`) | Screens, battle grid, menus, Android APK, browser build. |
| Navigation | **Expo Router** (file-based) | Screen routing, modals. |
| Animations | **React Native Reanimated 3** | Explosions, shell flight, ship drag/snap, UI transitions (UI-thread). |
| Gestures | **React Native Gesture Handler** | Ship drag & rotate, tap to fire, long-press. |
| 2D drawing | **@shopify/react-native-skia** | Grid, water shader/waves, particles, glow, radar sweep. (Reanimated drives Skia values.) On web, Skia runs via CanvasKit (WASM) loaded with `LoadSkiaWeb()` before the app renders. |
| Sprite/Lottie FX | **lottie-react-native** (optional) | Pre-made explosion / splash / confetti animations. |
| Sound | **expo-av** (or `expo-audio`) | SFX + background music with pooling. |
| Haptics | **expo-haptics** | Hit, sunk, victory vibrations. No-op on web (wrapped in a `haptics.ts` helper). |
| State | **Zustand** (+ `persist` middleware with AsyncStorage) | Menus, settings, profile, local game UI state. |
| Storage | **@react-native-async-storage/async-storage** | Profile, stats, settings, achievements. |
| Online | **Colyseus server (Node.js + TypeScript)** + **colyseus.js** client | Rooms, matchmaking, turn sync, authoritative state. |
| Game logic | **Pure TypeScript modules** (`server/src/shared/engine`) | Grid rules, placement, attacks, win conditions, bots. Owned by the server folder, also imported by the app for offline bot games. |
| Validation | **zod** | Validate client messages on server. |
| Tests | **Vitest** (engine/server), **Jest + RNTL** (app), **Maestro** (E2E, optional) | |
| Tooling | **npm** (each folder has its own `package.json`), ESLint, Prettier, TypeScript strict | |
| CI | GitHub Actions | Lint, typecheck, test for `server/` and `app/`; EAS build on tag. |
| Build | **EAS Build** (Android), **`expo export --platform web`** (Web) | Android APK (preview), AAB (store), static web bundle. |

---

## 5. Repository Structure (`server/` + `app/`)

The project has exactly **two top-level folders**, each an independent npm project with
its own `package.json`, `node_modules`, and scripts:

| Folder | Responsibility | Runs as |
|---|---|---|
| `server/` | **All backend logic** — Colyseus rooms, matchmaking, turn timers, authoritative game state, and the shared game engine + protocol. | One Node process (locally on `ws://localhost:2567`, later on a cloud host). |
| `app/` | **All app & UI** — one Expo codebase for **Android and Web**: screens, battle grid, animations, sounds, local stores, offline bot play. | Any number of clients: browser tabs, Android emulators, physical phones. |

```text
battleship/
├── README.md                    # how to run server + apps locally
├── plan.md
├── .gitignore
├── .github/workflows/ci.yml     # runs lint/typecheck/test in server/ and app/
│
├── server/                      # ── BACKEND (single process) ──
│   ├── package.json             # scripts: dev, build, start, test
│   ├── tsconfig.json
│   ├── .env.example             # PORT=2567, NODE_ENV, CORS_ORIGIN, LOG_LEVEL
│   ├── Dockerfile
│   ├── src/
│   │   ├── index.ts             # bootstrap, transport, /health, monitor (dev only)
│   │   ├── config.ts
│   │   ├── rooms/
│   │   │   ├── BattleRoom.ts
│   │   │   └── schema/BattleState.ts
│   │   ├── services/            # roomCode generator, rate limiter, logger
│   │   └── shared/              # PURE TS — no React, no Node APIs (imported by app/)
│   │       ├── engine/
│   │       │   ├── types.ts     # Coord, Cell, Ship, Board, GameState, ShotResult...
│   │       │   ├── config.ts    # GridPresets, FleetPresets, RuleSet defaults
│   │       │   ├── board.ts     # createBoard, cellAt, inBounds, neighbours
│   │       │   ├── placement.ts # canPlace, placeShip, removeShip, randomFleet
│   │       │   ├── attack.ts    # fire(), applyShot(), sunk detection
│   │       │   ├── weapons.ts   # weapon definitions + pattern resolution
│   │       │   ├── game.ts      # reducer: createGame, applyAction, phase machine
│   │       │   ├── rng.ts       # seeded RNG (mulberry32) for reproducible tests
│   │       │   ├── bot/
│   │       │   │   ├── index.ts # createBot(difficulty)
│   │       │   │   ├── easy.ts
│   │       │   │   ├── medium.ts
│   │       │   │   ├── hard.ts  # probability density
│   │       │   │   └── placement.ts
│   │       │   └── index.ts
│   │       └── protocol/        # message names, payload types, zod schemas, PROTOCOL_VERSION
│   │           └── index.ts
│   ├── scripts/
│   │   └── bot-sim.ts           # bot difficulty simulation
│   └── test/                    # engine, protocol, room tests
│
└── app/                         # ── APP & UI (Android + Web) ──
    ├── package.json             # scripts: start, web, android, build:web, test
    ├── app.config.ts            # reads EXPO_PUBLIC_SERVER_URL
    ├── eas.json
    ├── metro.config.js          # watchFolders: ['../server/src/shared']
    ├── tsconfig.json            # paths: { "@shared/*": ["../server/src/shared/*"] }
    ├── .env.example             # EXPO_PUBLIC_SERVER_URL=ws://localhost:2567
    ├── app/                     # Expo Router screens
    │   ├── _layout.tsx
    │   ├── index.tsx            # Splash → Home
    │   ├── home.tsx
    │   ├── bot-setup.tsx
    │   ├── online/
    │   │   ├── index.tsx        # Quick match / private room
    │   │   ├── matchmaking.tsx
    │   │   └── room.tsx         # Lobby with code
    │   ├── placement.tsx
    │   ├── battle.tsx
    │   ├── result.tsx
    │   ├── profile.tsx
    │   ├── achievements.tsx
    │   ├── settings.tsx
    │   └── how-to-play.tsx
    ├── src/
    │   ├── components/
    │   │   ├── grid/            # BattleGrid, GridCell, ShipSprite, Markers
    │   │   ├── fx/              # Explosion, Splash, Smoke, Fire, ShellTrail, ScreenShake
    │   │   ├── hud/             # TurnBanner, TurnTimer, FleetTracker, PowerUpBar, PlayerCard
    │   │   └── ui/              # Button, Panel, Modal, Badge, Avatar, Toggle, Toast
    │   ├── stores/              # Zustand stores
    │   ├── game/                # LocalGameController, OnlineGameController
    │   ├── net/                 # colyseus client wrapper, reconnection, server URL resolution
    │   ├── audio/               # SoundManager, music
    │   ├── platform/            # haptics.ts, storage.ts (web vs native differences)
    │   ├── theme/               # colors, typography, spacing, shadows
    │   ├── hooks/
    │   └── utils/
    └── assets/
        ├── images/ ships/ avatars/ badges/ ui/ backgrounds/
        ├── fx/                  # sprite sheets / lottie json
        ├── sounds/ music/
        └── fonts/
```

### 5.1 Shared code between the two folders

The rules must be identical offline (bot games on the device) and online (server is the
referee), so the engine and protocol live **once**, in `server/src/shared/`, and the app
imports them:

- `app/tsconfig.json` maps `@shared/*` → `../server/src/shared/*`.
- `app/metro.config.js` adds `../server/src/shared` to `watchFolders` so Metro bundles it
  for Android and Web.
- Hard rule: nothing in `shared/` may import Node APIs, Colyseus, or React. Only `zod` is
  allowed as a dependency, and it is installed in both folders.
- A lint rule (`no-restricted-imports`) in `server/` enforces this boundary.

### 5.2 Local development: one server, many app clients

```text
                       ┌──────────────────────────────┐
                       │  server/  (npm run dev)      │
                       │  ws://localhost:2567         │
                       └──────────────┬───────────────┘
        ┌───────────────┬─────────────┼───────────────┬───────────────┐
   Web tab #1      Web tab #2    Android emulator   Phone (Wi-Fi)   Phone #2 ...
  localhost:8081  localhost:8081  ws://10.0.2.2:2567 ws://<LAN-IP>:2567
```

- Start the server **once**; every app instance connects to it.
- Server URL resolution in `app/src/net/serverUrl.ts`:
  1. `EXPO_PUBLIC_SERVER_URL` if set (used for cloud builds).
  2. Web in dev → `ws://localhost:2567`.
  3. Android emulator in dev → `ws://10.0.2.2:2567` (emulator's alias for the host PC).
  4. Physical device in dev → host LAN IP taken from Expo's `hostUri`
     (`Constants.expoConfig.hostUri`), port 2567.
- **Multiple test users on one machine:** browser tabs share `localStorage`, so in dev
  builds the player identity can be overridden with a URL param, e.g.
  `http://localhost:8081/?player=alice` and `?player=bob`. Each value gets its own
  storage namespace (`bs.<player>.profile.v1`), so two tabs act as two different users.
  Incognito windows or different browsers also work.
- Server binds to `0.0.0.0` so phones on the same Wi-Fi can reach it (allow port 2567
  through Windows Firewall).
- In dev, `@colyseus/monitor` runs at `http://localhost:2567/colyseus` to inspect rooms
  and connected clients.

### 5.3 Moving the server to the cloud later

Nothing in the app changes except the URL: deploy `server/` (Dockerfile) to the cloud host,
then build the app with `EXPO_PUBLIC_SERVER_URL=wss://<your-host>`. Local testing keeps
working by leaving the variable unset.

---

## 6. Game Rules (MVP)

### 6.1 Grid
- 10×10, columns **A–J**, rows **1–10**.
- Each player has two views: **My Waters** (own fleet + incoming shots) and
  **Enemy Waters** (target grid with my shots).

### 6.2 Fleet (classic)

| Ship | Length | Count |
|---|---|---|
| Carrier | 5 | 1 |
| Battleship | 4 | 1 |
| Cruiser | 3 | 1 |
| Submarine | 3 | 1 |
| Destroyer | 2 | 1 |

Total ship cells: **17**.

### 6.3 Placement rules
- Ships horizontal or vertical, fully inside the grid.
- No overlapping.
- No touching (including diagonals) unless rule `allowTouching = true`.
- All ships must be placed before "Ready".

### 6.4 Turn flow
1. Phase `placement` → both players ready → phase `battle`.
2. Random coin-flip decides first player (animated).
3. Active player picks a cell (or uses a power-up) on Enemy Waters.
4. Result: `miss` | `hit` | `sunk(shipId)`.
5. Turn passes to opponent (unless `bonusShotOnHit` and result is hit/sunk).
6. Already-fired cells cannot be targeted again.
7. When all enemy ship cells are hit → phase `finished`, winner declared.

### 6.5 Sunk reveal
- When a ship is sunk, its full outline is revealed on the attacker's target grid.
- If `allowTouching = false`, cells surrounding the sunk ship are auto-marked as
  "known empty" (dim dot) — reduces pointless shots and is a nice UX touch.

### 6.6 Timer
- Online: 30 s per turn, 60 s for placement. Last 5 s: ticking sound + red pulse.
- Offline vs. bot: timer optional (setting, default off).

### 6.7 Win / loss / draw
- Win: sink all enemy ships.
- Loss: own fleet sunk, forfeit, 3 timeouts, or disconnect beyond grace window.
- No draws in classic mode.

---

## 7. Shared Game Engine (`server/src/shared/engine`)

### 7.1 Core types (sketch)

```ts
export type Coord = { x: number; y: number };           // 0-based
export type Orientation = 'H' | 'V';

export interface ShipDef {                               // data-driven → future shapes
  id: string;                                            // 'carrier'
  name: string;
  cells: Coord[];                                        // shape relative to origin; line for MVP
  count: number;
}

export interface PlacedShip {
  uid: string;                                           // 'carrier#0'
  defId: string;
  origin: Coord;
  rotation: 0 | 90 | 180 | 270;                          // MVP uses 0/90 only
  cells: Coord[];                                        // absolute
  hits: number;
}

export type CellState = 'unknown' | 'miss' | 'hit' | 'sunk' | 'knownEmpty';

export interface Board {
  width: number;
  height: number;
  ships: PlacedShip[];
  shots: Record<string, CellState>;                      // key "x,y"
}

export interface RuleSet {
  grid: { width: number; height: number };
  fleet: ShipDef[];
  allowTouching: boolean;
  bonusShotOnHit: boolean;
  powerUpsEnabled: boolean;
  turnTimeMs: number | null;
  placementTimeMs: number | null;
}

export type Phase = 'placement' | 'battle' | 'finished';

export interface GameState {
  rules: RuleSet;
  phase: Phase;
  players: [PlayerState, PlayerState];
  activePlayer: 0 | 1;
  turnNumber: number;
  winner: 0 | 1 | null;
  log: ShotEvent[];                                      // for replay/animation queue
}

export type Action =
  | { type: 'PLACE_FLEET'; player: 0 | 1; ships: PlacedShip[] }
  | { type: 'READY'; player: 0 | 1 }
  | { type: 'FIRE'; player: 0 | 1; target: Coord }
  | { type: 'USE_WEAPON'; player: 0 | 1; weaponId: string; target: Coord; orientation?: Orientation }
  | { type: 'TIMEOUT'; player: 0 | 1 }
  | { type: 'FORFEIT'; player: 0 | 1 };

export interface ShotEvent {
  by: 0 | 1;
  weaponId: string;                                      // 'standard' | 'artillery' | 'sonar'
  results: { coord: Coord; result: 'miss' | 'hit' | 'sunk'; shipUid?: string }[];
  sonar?: { area: Coord[]; shipCellsFound: number };
  turnPassed: boolean;
}
```

### 7.2 Public API

| Function | Description |
|---|---|
| `createGame(rules, seed)` | Initial state in `placement` phase. |
| `applyAction(state, action) → { state, events, error? }` | Pure reducer. Never mutates input. Returns error codes (`NOT_YOUR_TURN`, `ALREADY_FIRED`, `OUT_OF_BOUNDS`, `INVALID_PLACEMENT`, `WEAPON_NOT_READY`). |
| `canPlace(board, shipDef, origin, rotation, rules)` | Placement validation (for live UI highlighting). |
| `randomFleet(rules, rng)` | Valid random placement; backtracking with retry limit. |
| `getPublicView(state, viewer)` | Redacts opponent ship positions (only hits/sunk revealed). Used by server. |
| `legalTargets(board)` | Unfired cells. |
| `isFleetSunk(board)` | Win check. |
| `createBot(difficulty, rules, rng)` | Returns `{ placeFleet(), chooseAction(view) }`. |

### 7.3 Engine principles
- 100% pure & deterministic given a seed → easy tests, replays, and bug reproduction.
- No dependency on React, Node, timers, or randomness outside `rng.ts`.
- Grid size and fleet come from `RuleSet` — never hardcode `10` or ship lengths.
- Target: ≥ 90% unit test coverage on the engine.

---

## 8. Bot AI (Easy / Medium / Hard)

All bots only see the **public view** (what a human would see) — **no cheating** on any
difficulty. Bots add a short "thinking" delay (600–1400 ms, randomized) so turns feel natural.

### 8.1 Bot placement
| Difficulty | Placement |
|---|---|
| Easy | Pure random valid placement. |
| Medium | Random, with a slight preference against obvious clusters. |
| Hard | Randomized but avoids high-probability center bias: mixes edge placements and spreads ships out; never repeats the same layout pattern consecutively. |

### 8.2 Easy — "Cadet"
- Fires at a random unfired cell.
- After a hit, 50% chance it tries an adjacent cell next; otherwise stays random.
- Never uses power-ups strategically (uses them randomly when charged, 30% chance).
- Expected: ~ 85–95 shots to win.

### 8.3 Medium — "Captain" (Hunt & Target)
- **Hunt mode:** random fire on a **checkerboard parity** pattern (only cells where
  `(x + y) % 2 === 0`, adjusted for smallest remaining ship length).
- **Target mode:** after a hit, push the 4 neighbours onto a stack; once two hits are
  aligned, continue along that line in both directions until sunk.
- Returns to hunt mode once the ship is sunk and no unresolved hits remain.
- Uses Heavy Artillery when charged and there is an unresolved hit; Sonar on the
  largest unexplored region.
- Expected: ~ 55–65 shots to win.

### 8.4 Hard — "Admiral" (Probability Density)
- Each turn, for every remaining (unsunk) enemy ship, enumerate every legal placement
  consistent with the known board (misses, hits, sunk ships, known-empty cells, and the
  no-touching rule). Each placement adds +1 to every cell it covers.
- Placements overlapping unresolved **hits** get a large weight multiplier (×20–×50) so
  the bot efficiently finishes wounded ships.
- Fire at the highest-density unfired cell (ties broken randomly).
- Power-up logic: evaluate Heavy Artillery at each candidate center by summing density
  of its pattern; use it if expected value beats a standard shot by a threshold. Sonar
  is used on the 3×3 region with the highest total density during hunt phase.
- Performance: 10×10 with 5 ships → a few thousand placements, well under 5 ms. For
  future 15×15 grids, cap work and move computation off the JS thread via
  `InteractionManager` / chunking if needed.
- Expected: ~ 40–50 shots to win.

### 8.5 Bot verification
- Simulation script in `server/scripts/bot-sim.ts`: run 1,000 games per difficulty
  vs. random layouts, report mean/median shots-to-win. Gate in CI: Hard < Medium < Easy.

---

## 9. Power-ups & Heavy Artillery

Enabled only in **Arsenal** mode. Designed as data in `weapons.ts` so new weapons can be
added later without touching the reducer.

### 9.1 Charge meter
- Each player has a charge meter (0–100).
- +20 per hit, +40 per ship sunk, +10 per miss streak of 3 (comeback help).
- Power-ups cost charge; button glows when affordable.

### 9.2 MVP power-ups

| Power-up | Cost | Effect | Uses your turn? |
|---|---|---|---|
| **Heavy Artillery** | 100 | Strikes a **plus-shaped 5-cell** pattern (center + 4 orthogonal). Each cell resolved like a normal shot. Already-fired cells in the pattern are skipped. | Yes |
| **Sonar Scan** | 60 | Scans a 3×3 area; reveals the **number** of ship cells inside (not their positions). Shows a radar ping animation and number badge on the grid. | Yes |

Limits: max 1 power-up per turn; Heavy Artillery max 2 uses per match (prevents snowball).

### 9.3 Weapon definition shape

```ts
interface WeaponDef {
  id: 'standard' | 'artillery' | 'sonar' | string;
  name: string;
  cost: number;
  maxUses: number | null;
  pattern: Coord[];                 // offsets from target center
  kind: 'damage' | 'reveal';
  rotatable: boolean;               // future torpedo/airstrike lines
}
```

### 9.4 UX
- Tap power-up in the bottom bar → grid enters "aiming mode" with a translucent pattern
  preview that follows the finger; tap again to confirm, or tap the power-up to cancel.
- Heavy Artillery: incoming shell whistle → 5 staggered explosions (80 ms apart) → big
  screen shake.

---

## 10. Online Multiplayer (Colyseus Server)

### 10.1 Room model
- One room type: **`battle`** (`BattleRoom`), `maxClients = 2`.
- **Quick Match:** `client.joinOrCreate('battle', { mode, profile })` — Colyseus matchmaking
  fills rooms filtered by `mode` (classic / arsenal).
- **Private Room:** `client.create('battle', { private: true, ... })` → server generates a
  6-char code (no ambiguous chars: no 0/O/1/I). Friend joins via
  `client.join('battle', { code })` (room lookup via `filterBy(['code'])` or a code → roomId map).
- Room is locked when 2 players joined; disposed when game ends + both leave, or after
  idle timeout.

### 10.2 Authoritative state
- Server holds the full `GameState` (from the engine) **privately**.
- Synced Colyseus `Schema` contains only **public** data:

```ts
class PlayerPublic extends Schema {
  @type('string') sessionId;
  @type('string') name;
  @type('string') avatarId;
  @type('number') wins;            // self-reported in MVP (display only)
  @type('number') losses;
  @type('boolean') ready;
  @type('boolean') connected;
  @type('number') charge;
  @type(['string']) shipsSunk;     // ship defIds lost
}

class BattleState extends Schema {
  @type('string') phase;           // waiting | placement | battle | finished
  @type({ map: PlayerPublic }) players;
  @type('string') activeSessionId;
  @type('number') turnDeadline;    // server epoch ms
  @type('number') turnNumber;
  @type('string') winnerSessionId;
  @type('string') mode;
  @type('string') code;
}
```

- Each player's **target grid** (shots + results) is derived from `ShotEvent`s broadcast
  as messages; each player's **own fleet** is sent only to that client. Opponent ship
  positions never leave the server until game end (then revealed for the result screen).

### 10.3 Messages (`server/src/shared/protocol`)

| Direction | Message | Payload | Notes |
|---|---|---|---|
| C → S | `place_fleet` | `{ ships: {defId, x, y, rotation}[] }` | Validated with zod + `canPlace`. |
| C → S | `ready` | `{}` | |
| C → S | `fire` | `{ x, y }` | Only active player. |
| C → S | `use_weapon` | `{ weaponId, x, y, orientation? }` | |
| C → S | `forfeit` | `{}` | |
| C → S | `emote` | `{ id }` | Optional fun: 6 preset emotes, rate-limited. |
| C → S | `rematch` | `{}` | Both must send. |
| S → C | `shot_result` | `ShotEvent` | Drives animations on both clients. |
| S → C | `your_fleet` | `PlacedShip[]` | Sent to owner only. |
| S → C | `game_over` | `{ winner, reason, revealFleet }` | reason: sunk / forfeit / timeout / disconnect. |
| S → C | `error` | `{ code, message }` | |

### 10.4 Turn timer & timeouts
- Server uses `this.clock.setTimeout` for turn & placement deadlines;
  `turnDeadline` is synced so clients render the countdown (client never decides time).
- On turn timeout: server fires a random legal shot for the player (A4); counter +1;
  3 consecutive → forfeit.
- On placement timeout: server calls `randomFleet` for that player.

### 10.5 Reconnection
- `allowReconnection(client, 30)` — 30 s grace window. Opponent sees "Opponent
  reconnecting… 0:27" banner; turn timer pauses during disconnection of the active player.
- Client stores `reconnectionToken` in memory + AsyncStorage; on app foreground / network
  regain, calls `client.reconnect(token)`. On reconnect, server re-sends `your_fleet` and
  the full shot log so the client can rebuild boards.

### 10.6 Security & anti-cheat
- Server never trusts client results; all shots resolved by engine on server.
- zod validation on every message; ignore messages out of phase/turn.
- Rate limit: max 5 messages / second per client.
- Nickname sanitized (length 3–16, basic profanity filter).
- Only `wss://` in production.

### 10.7 Server ops
- Node 20 LTS, `@colyseus/core`, `@colyseus/ws-transport`.
- Health endpoint `/health`; `@colyseus/monitor` only in dev.
- Structured logs (pino). Dockerfile for deploy (Fly.io/Render/Railway).
- Env: `PORT`, `NODE_ENV`, `CORS_ORIGIN`, `LOG_LEVEL`.
- Single instance for MVP; Redis presence/driver later for horizontal scaling.

---

## 11. App Architecture (Android + Web)

### 11.1 Game controller abstraction
Both modes implement the same interface so the Battle screen doesn't care where the game
comes from:

```ts
interface GameController {
  mode: 'bot' | 'online';
  placeFleet(ships: PlacedShip[]): void;
  ready(): void;
  fire(target: Coord): void;
  useWeapon(id: string, target: Coord, orientation?: Orientation): void;
  forfeit(): void;
  subscribe(listener: (e: ControllerEvent) => void): () => void;
}
```

- `LocalGameController` — runs the engine reducer on device; drives the bot with delays.
- `OnlineGameController` — wraps colyseus.js room; maps server messages to events.

### 11.2 Animation event queue
- Engine/server produce `ShotEvent`s instantly; the UI pushes them into an **FX queue**
  and plays them sequentially (shell flight → impact → marker → fleet tracker update).
- Board visuals update only after the impact frame so state and animation stay in sync.
- Input is locked while the queue is playing.

### 11.3 Zustand stores

| Store | Persisted? | Contents |
|---|---|---|
| `useSettingsStore` | Yes | soundVolume, musicVolume, haptics, offlineTimer, bonusShotOnHit, allowTouching, defaultMode. |
| `useProfileStore` | Yes | playerId (UUID), nickname, avatarId, createdAt. |
| `useStatsStore` | Yes | per-mode & per-difficulty wins/losses, shots, hits, accuracy, streaks, fastest win. |
| `useAchievementsStore` | Yes | unlocked badge ids + unlock timestamps, progress counters. |
| `useMatchStore` | No | current controller, my board, enemy target board, phase, active player, timer deadline, charge, fx queue, selected weapon. |
| `useUiStore` | No | modals, toasts, loading, network status. |

### 11.4 Key components
- `BattleGrid` (Skia canvas): water background, grid lines, coordinate labels,
  markers, ship sprites, aim preview, sonar overlay. Single canvas for performance
  (not 100 individual Views).
- `GridTouchLayer`: Gesture Handler tap → cell coordinate conversion.
- `ShipSprite` / `DraggableShip`: drag (Pan), rotate (Tap / double-tap), snap to grid,
  red/green validity tint.
- `FleetTracker`: list of enemy ships as silhouettes; sunk ones crossed out in red.
- `TurnBanner`: "YOUR TURN" / "ENEMY TURN" slide-in.
- `TurnTimer`: circular ring countdown (Skia arc), red pulse at ≤5 s.
- `PlayerCard`: avatar, name, W/L, ships remaining.
- `PowerUpBar`: charge meter + weapon buttons.
- `FX`: `Explosion`, `WaterSplash`, `SmokePlume`, `FireLoop` (on damaged ship cells),
  `ShellTrail`, `ScreenShake`, `RadarPing`, `Confetti`.

### 11.5 Battle screen layout (portrait)

```text
┌─────────────────────────────────┐
│ [Avatar] Enemy  W12 L4  ⏱ 0:24  │  ← opponent card + turn timer
│  Enemy fleet: ▬▬▬▬▬ ▬▬▬▬ ▬▬▬ ...│  ← fleet tracker (sunk = red strike)
├─────────────────────────────────┤
│                                 │
│        ENEMY WATERS 10×10       │  ← main target grid (large)
│                                 │
├─────────────────────────────────┤
│  YOUR TURN — Select a target    │  ← turn banner / status
│ [Mini: MY WATERS]  [⚡ Charge ▓▓░]│  ← mini own board + power-ups
│                    [💥 Artillery][📡 Sonar]│
│ [Avatar] You   W30 L11           │
└─────────────────────────────────┘
```
- When it's the enemy's turn, the boards **swap with a smooth camera transition**:
  own board becomes large so the player watches incoming fire, enemy board shrinks.

---

## 12. Screens & User Flows

### 12.1 Screen list

| # | Screen | Key elements |
|---|---|---|
| 1 | **Splash** | Logo, animated waves, loading assets/fonts/sounds. |
| 2 | **First-run Onboarding** | Pick nickname + avatar; quick 3-card "how to play". |
| 3 | **Home** | Big buttons: *Play vs Bot*, *Play Online*, *Private Room*; secondary: Profile, Medals, Settings, How to Play. Animated battleship + sea background. |
| 4 | **Bot Setup** | Difficulty cards (Cadet / Captain / Admiral with descriptions), mode toggle (Classic / Arsenal), rules (bonus shot, touching), Start. |
| 5 | **Online Menu** | Quick Match (Classic / Arsenal), Create Private Room, Join with Code. Shows connection status. |
| 6 | **Matchmaking** | Radar sweep animation, "Searching for opponent…", elapsed time, Cancel. Optional: after 30 s offer "Play vs Bot instead". |
| 7 | **Private Room Lobby** | Big room code, Copy / Share buttons, waiting state, both player cards when joined. |
| 8 | **Fleet Placement** | Grid + ship dock; drag, tap to rotate, Randomize, Clear, Ready; placement timer online; "Waiting for opponent…" overlay after ready. |
| 9 | **Coin Flip** (overlay) | Animated coin/anchor flip showing who goes first. |
| 10 | **Battle** | See §11.5. Pause menu (offline) / Forfeit confirm (online). |
| 11 | **Result** | VICTORY / DEFEAT banner, medals earned, stats (shots, accuracy, time, ships lost), both fleets revealed, *Rematch*, *Home*. |
| 12 | **Profile** | Avatar, nickname edit, stats per mode & difficulty, accuracy, streaks, rank title. |
| 13 | **Achievements / Medals** | Grid of badges, locked (silhouette) vs. unlocked, progress bars. |
| 14 | **Settings** | Sound, music, haptics, offline timer, default rules, reset data, credits/licenses. |
| 15 | **How to Play** | Illustrated rules, power-ups explained. |

### 12.2 Flows

**Offline vs. Bot**
`Home → Bot Setup → Fleet Placement → Coin Flip → Battle → Result → (Rematch → Placement) | Home`

**Quick Match**
`Home → Online Menu → Matchmaking → Fleet Placement (60 s) → Coin Flip → Battle → Result → Rematch | Home`

**Private Room**
`Home → Online Menu → Create → Lobby (share code) → friend joins → Fleet Placement → …`
`Home → Online Menu → Join with Code → enter code → Fleet Placement → …`

### 12.3 Edge cases to handle
- App backgrounded during online match → reconnect on foreground.
- No internet → Online buttons disabled with toast; bot mode always works.
- Opponent leaves → "Opponent left — you win" result.
- Server version mismatch → "Please update the app" message (protocol version in join options).
- Pause in offline game → state preserved; resume or quit (quit counts as loss? → **no** for bot games).
- Android back button: confirm dialog in placement/battle.

---

## 13. Visual Design System

### 13.1 Art direction
Clean **2D top-down military/naval** style: dark ocean, steel panels with rivets,
stencil typography, signal-red accents, radar-green highlights. Think "tactical command
console" meets "polished casual mobile game".

### 13.2 Color palette

| Token | Hex | Use |
|---|---|---|
| `navy900` | `#0A1628` | App background |
| `navy700` | `#13294B` | Panels |
| `ocean500` | `#1E5A8A` | Grid water |
| `ocean300` | `#4FA3D9` | Water highlights, waves |
| `steel400` | `#8A9BB0` | Borders, ship hulls |
| `steel100` | `#E3E9F0` | Primary text |
| `signalRed` | `#E53935` | Hit markers, danger, timer warning |
| `fireOrange` | `#FF8F00` | Explosions, fire |
| `radarGreen` | `#3DDC97` | Valid placement, sonar, "your turn" |
| `brass` | `#D4A93A` | Medals, rank, premium buttons |
| `missWhite` | `#CFD8DC` | X miss markers |

### 13.3 Typography
- Headings: **Black Ops One** or **Stardos Stencil** (Google Fonts, OFL) — stencil military.
- Body/UI: **Rajdhani** or **Exo 2** — clean, techy, readable.
- Loaded with `expo-font` at splash.

### 13.4 Grid visuals
- Animated water texture (Skia shader: slow sine-wave displacement + subtle caustics).
- Thin luminous grid lines, coordinate labels A–J / 1–10.
- Markers:
  - **Miss:** white **X** with small ripple rings that fade.
  - **Hit:** **red circle/peg** with glow + persistent small fire/smoke loop.
  - **Sunk:** ship silhouette revealed, charred dark tint, red outline.
  - **Known empty:** small dim dot.
- Target reticle on press-hold before release (precision aid on small screens).

### 13.5 Ships
- Top-down 2D warship sprites per class (carrier deck markings, battleship turrets,
  submarine shape, etc.), segmented per cell so damage can show per-segment.
- Damaged segments show scorch decal + smoke.

### 13.6 UI components
- Buttons: beveled steel plates, press-down animation (scale 0.96) + click sound.
- Panels: dark translucent with rivet corners and thin brass/steel border.
- Avatars: 12 preset illustrated military portraits (captain, admiral, sailor, pilot, etc.)
  in circular brass frames.
- Badges: medal-shaped icons (bronze/silver/gold variants).

### 13.7 Asset list (MVP)
- Ships: 5 sprites (+ damaged overlay, sunk variant).
- FX: explosion sprite sheet (12–16 frames), splash sheet, smoke, fire loop, shell, muzzle flash.
- UI: logo, home background (sea + battleship illustration), button frames, panel frames,
  icons (sound, music, haptics, settings, back, share, copy), coin/anchor.
- Avatars: 12. Badges: 12.
- App icon + adaptive icon + splash image.

---

## 14. Animations

All animations run on the UI thread via **Reanimated worklets** / **Skia** values, at 60 fps.

| Moment | Animation | Duration |
|---|---|---|
| App open | Logo drop + waves + ship sail-in on Home | 1.2 s |
| Button press | Scale 0.96 + shadow shrink | 100 ms |
| Screen transition | Slide/fade with slight parallax | 300 ms |
| Ship drag | Lift (scale 1.08 + shadow), follow finger, snap spring to cell | spring |
| Invalid placement | Red tint + horizontal shake | 250 ms |
| Ship rotate | 90° spring rotation around pivot | 200 ms |
| Randomize fleet | Ships scatter then fly into new positions staggered | 500 ms |
| Turn change | Banner slides in "YOUR TURN"/"ENEMY TURN", board swap camera | 600 ms |
| Aim | Reticle scale-in + pulsing on selected cell | loop |
| Fire | Shell arcs from bottom (own fleet) to target cell with trail | 450 ms |
| Miss | Water splash sprite + ripple rings + X marker pops in | 500 ms |
| Hit | Explosion sprite + flash + debris particles + screen shake (small) + red marker | 600 ms |
| Sunk | Chain explosions along ship + ship silhouette reveal + "SHIP SUNK!" stamp + big shake | 1.2 s |
| Incoming hit on own ship | Segment flashes red, fire starts looping | 600 ms |
| Heavy Artillery | Whistle, 5 staggered explosions, heavy shake | 1.0 s |
| Sonar | Radar ring sweep across 3×3 + number badge pop | 900 ms |
| Timer ≤ 5 s | Ring turns red, pulses each second | loop |
| Victory | Confetti + medals fly in + brass "VICTORY" stamp | 2 s |
| Defeat | Desaturate + sinking ship + "DEFEAT" stamp | 2 s |
| Badge unlock | Toast slides down with shine sweep | 1.5 s |

**Reduced motion setting:** disables screen shake and particles for accessibility.

---

## 15. Sound & Haptics

### 15.1 SFX list

| Event | Sound |
|---|---|
| UI tap | Metallic click |
| Ship pick / drop | Clunk / water thud |
| Rotate | Short servo whir |
| Invalid placement | Low buzz |
| Ready | Horn blast |
| Fire | Cannon boom + shell whistle |
| Miss | Water splash |
| Hit | Explosion |
| Sunk | Big explosion + metal creak / sinking bubbles |
| Heavy Artillery | Incoming whistle + multi-boom |
| Sonar | Classic sonar ping |
| Your turn | Short radio chirp |
| Timer last 5 s | Tick |
| Victory | Triumphant brass fanfare |
| Defeat | Somber low horn |
| Badge unlock | Medal chime |
| Matchmaking found | Alert klaxon (short) |

### 15.2 Music
- Home/menu: calm ambient naval theme with ocean sounds (loop).
- Battle: tense percussive loop; intensity layer when either player has ≤ 1 ship left.
- Separate music & SFX volume sliders.

### 15.3 SoundManager
- Preload all SFX at splash into a pool (`expo-av Sound` objects).
- Allow overlapping instances for explosions (pool size 3).
- Respect settings & system silent mode; pause music on app background.

### 15.4 Haptics
- Light: UI taps, ship snap. Medium: hit. Heavy: sunk, artillery. Success pattern: victory.
- Toggle in settings.

---

## 16. Player Profile, Stats, Badges & Medals

### 16.1 Profile
- Nickname (3–16 chars), avatar (12 presets), player ID (UUID, hidden).
- Rank title by total wins: *Recruit (0)*, *Ensign (5)*, *Lieutenant (15)*,
  *Commander (30)*, *Captain (60)*, *Admiral (100)*, *Fleet Admiral (200)*.

### 16.2 Stats tracked
- Games played / won / lost — total, online, and per bot difficulty.
- Total shots, hits, accuracy %.
- Current and best win streak.
- Fastest win (fewest shots, shortest time).
- Ships sunk total, power-ups used.

### 16.3 Achievements (MVP set of 12)

| Badge | Condition |
|---|---|
| First Blood | Get your first hit |
| Maiden Voyage | Finish your first game |
| Victory at Sea | Win your first game |
| Sharpshooter | Win with ≥ 60% accuracy |
| Untouchable | Win without losing a ship |
| Comeback Admiral | Win with only 1 ship left |
| Cadet Crusher | Beat Easy bot 5 times |
| Captain's Bane | Beat Medium bot |
| Admiral Slayer | Beat Hard bot |
| Online Warrior | Win 10 online games |
| Big Guns | Sink a ship using Heavy Artillery |
| Streak of Steel | Win 5 games in a row |

Medals on the Result screen: Gold/Silver/Bronze based on accuracy for that match.

---

## 17. Persistence & Data

- **AsyncStorage** (backed by `localStorage` on web) via Zustand `persist` with versioned keys (`bs.settings.v1`,
  `bs.profile.v1`, `bs.stats.v1`, `bs.achievements.v1`) and `migrate` functions.
- Offline in-progress bot game is saved on app background (`bs.savedGame.v1`) so it can be
  resumed.
- Server: in-memory only for MVP. Future: Postgres (Neon/Supabase) for accounts, stats,
  leaderboards; Redis for presence when scaling.

---

## 18. Testing Strategy

| Layer | Tool | What |
|---|---|---|
| Engine | Vitest | Placement validity, randomFleet always valid (property test, 10k seeds), fire/hit/sunk, no double-fire, win detection, weapons patterns, rule toggles, public-view redaction. |
| Bots | Vitest + sim script | Never fires illegal shot; never cheats (uses only public view); difficulty ordering by mean shots. |
| Protocol | Vitest | zod schemas accept valid / reject invalid payloads. |
| Server | Vitest + `@colyseus/testing` | Join/match, turn enforcement, timeouts, auto-randomize, reconnection, forfeit, opponent fleet never leaked in state or messages. |
| App units | Jest + React Native Testing Library | Stores, controllers, critical components (placement, HUD). |
| E2E | Maestro (optional) | Onboarding → bot game → result; placement randomize & ready. |
| Manual QA | Checklist | Low-end Android device performance, sounds, haptics, reconnect by toggling airplane mode. |

CI (GitHub Actions): install → lint → typecheck → test (engine, protocol, server, app).

---

## 19. Build, Deployment & Release

### 19.1 App — Android
- `eas.json` profiles:
  - `development` — dev client.
  - `preview` — **Android APK** (`buildType: "apk"`) for sharing/testing.
  - `production` — AAB for Play Store.
- `app.config.ts` reads `EXPO_PUBLIC_SERVER_URL` per profile.
- App id e.g. `com.<yourname>.battleship`, versionCode auto-increment.
- Portrait lock, adaptive icon, splash screen.

### 19.2 App — Web
- `cd app && npx expo export --platform web` → static files in `app/dist/`.
- Host on any static host (Vercel, Netlify, Cloudflare Pages) or serve from the server
  later. CanvasKit WASM file for Skia is copied into the web build.
- Desktop browsers: game renders in a centered phone-width column; mouse clicks act as taps.

### 19.3 Server
- `cd server && npm run build && npm start` (compiled to `server/dist/`).
- Dockerfile (node:20-alpine) builds only the `server/` folder.
- Deploy to Fly.io / Render / Railway with WebSocket support; HTTPS/WSS.
- Protocol version check on join to reject outdated clients.

### 19.4 Release checklist
- Asset licenses recorded in Credits screen (CC0 / OFL attributions).
- Privacy note (no personal data collected beyond nickname).
- Smoke test APK on 2 physical Android devices (one low-end).

---

## 20. Performance Budget

- 60 fps on mid-range Android during explosions; ≥ 45 fps on low-end.
- Battle grid rendered in **one Skia canvas** (avoid 200 RN Views).
- Sprite sheets ≤ 1024×1024, compressed PNG/WebP; total app assets < 30 MB.
- Hard bot decision < 20 ms on 10×10.
- Cold start to Home < 3 s.
- Online: shot result round-trip < 200 ms on typical 4G.

---

## 21. Milestones & Task Breakdown

Estimates assume one developer; adjust as needed.

### M0 — Project setup (1–2 days)
- [ ] Create `server/` (Node + TypeScript + Colyseus) and `app/` (Expo + Router, Android + Web), each with its own `package.json`; TypeScript strict, ESLint/Prettier.
- [ ] Create `server/src/shared/{engine,protocol}`; wire `@shared/*` alias and Metro `watchFolders` in `app/`.
- [ ] Server URL resolution (web / emulator / LAN device / env var) and dev `?player=` identity override.
- [ ] `README.md` with local run instructions; verify 2 web tabs + 1 Android client connect to one local server.
- [ ] Install Reanimated, Gesture Handler, Skia, expo-av, expo-haptics, Zustand, AsyncStorage.
- [ ] CI workflow (lint, typecheck, test).
- [ ] Theme tokens, fonts, base UI components (Button, Panel, Modal).

### M1 — Game engine (3–4 days)
- [ ] Types, config presets (grid + fleet as data).
- [ ] Board, placement (`canPlace`, `randomFleet`), no-touch rule.
- [ ] Attack resolution, sunk detection, known-empty marking, win check.
- [ ] Game reducer with phases & turn rules (bonus shot toggle).
- [ ] Public view redaction.
- [ ] Full unit tests.

### M2 — Bots (2–3 days)
- [ ] Easy, Medium (hunt/target + parity), Hard (probability density).
- [ ] Bot placement strategies.
- [ ] Simulation script + CI assertions.

### M3 — Offline playable vertical slice (4–5 days)
- [ ] Home, Bot Setup, Placement, Battle, Result screens (basic visuals).
- [ ] `LocalGameController` + `useMatchStore` + FX queue.
- [ ] Skia `BattleGrid` with tap-to-fire, markers.
- [ ] Draggable ships with snap/rotate/validity.
- [ ] Fleet tracker, turn banner, board swap.
- ✅ Milestone: full game vs. any bot difficulty on device.

### M4 — Juice: animations, sound, haptics (4–5 days)
- [ ] Explosion/splash/smoke/fire FX, shell trail, screen shake.
- [ ] Sunk sequence, victory/defeat sequences, coin flip.
- [ ] SoundManager + all SFX + music; haptics.
- [ ] Animated water shader, home screen animations.
- [ ] Reduced-motion setting.

### M5 — Power-ups (2 days)
- [ ] Weapon definitions, charge meter in engine.
- [ ] Heavy Artillery & Sonar resolution + tests.
- [ ] Aiming mode UI + FX; bot power-up usage.

### M6 — Online multiplayer (5–7 days)
- [ ] `BattleRoom` with schema, engine integration, message handlers + zod.
- [ ] Quick match & private room codes.
- [ ] Turn/placement timers, auto-shot, forfeit on 3 timeouts.
- [ ] Reconnection flow (server + client).
- [ ] `OnlineGameController`, Online Menu, Matchmaking, Lobby screens.
- [ ] Rematch.
- [ ] Server tests (incl. no-leak test).
- [ ] Deploy server; point preview build at it.

### M7 — Profile, stats, achievements, settings (2–3 days)
- [ ] Onboarding (nickname + avatar).
- [ ] Stats tracking hooks at game end.
- [ ] Achievement engine (event-driven checks) + unlock toasts.
- [ ] Profile, Achievements, Settings, How to Play screens.

### M8 — Polish, QA, release (3–4 days)
- [ ] Final art pass, icon, splash.
- [ ] Edge cases (§12.3), back button, offline handling.
- [ ] Performance profiling on low-end device.
- [ ] Save/resume offline game.
- [ ] EAS preview APK + production AAB; credits/licenses.

**Total MVP estimate: ~ 26–35 working days.**

---

## 22. Future Features (Post-MVP) Design Notes

### 22.1 Custom grid sizes
| Preset | Grid | Suggested fleet |
|---|---|---|
| Small | 8×8 | 4 ships: 4, 3, 3, 2 |
| Medium | 10×10 | Classic 5 ships (17 cells) |
| Large | 12×12 | 7 ships: 5, 4, 4, 3, 3, 2, 2 |
| Extra Large | 15×15 | 10 ships incl. 6-length "Dreadnought" |

- Already supported by `RuleSet.grid` + `FleetPresets`. UI work: dynamic cell size,
  pinch-zoom & pan on Large/XL (Gesture Handler pinch + Reanimated transform), mini-map.
- Online matchmaking filtered by grid size. Bot density computation chunked for XL.

### 22.2 Different ship shapes & sizes
- `ShipDef.cells` already supports arbitrary polyomino shapes (L, T, 2×2 "Fortress").
- Need: full 4-rotation support, sprite per shape, rotation pivot logic in placement UI,
  Hard bot enumerates all rotations (already generic).

### 22.3 More weapons
| Weapon | Pattern | Idea |
|---|---|---|
| Torpedo | Travels along a row from edge until first hit | Rotatable line |
| Airstrike | 3–5 cells in a line | Rotatable |
| Cluster Bomb | 4 random cells in 3×3 | Random spread |
| Shield | Protects one own cell for 1 enemy shot | Defensive |
| Decoy | Fake ship blip on enemy sonar | Defensive/reveal |
| Repair Kit | Restore one hit segment (not sunk) | Defensive |
- Requires `WeaponDef.kind` extension (`defense`) and state for shields/decoys.

### 22.4 Other
- Accounts (Google sign-in), cloud stats, global leaderboard with ELO/MMR matchmaking.
- Friends list & invites via deep links (`battleship://join/ABC123`).
- Emotes/quick chat, spectator mode, replays (engine log is already replayable).
- Cosmetics: ship skins, grid themes, avatar frames. iOS release.

---

## 23. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Animations janky on low-end Android | Single Skia canvas, UI-thread worklets, sprite sheets, reduced-motion fallback, early device profiling (M3). |
| Online desync between animation & state | Server is the single source of truth; client plays event queue and rebuilds from full log on reconnect. |
| Cheating via modified client | Opponent fleet never sent to client; server resolves everything. |
| Disconnects on mobile networks | 30 s reconnection grace, paused timer, token persisted. |
| Hard bot feels unfair | No-cheat guarantee, tested via public-view-only API; tune with simulation stats. |
| Power-ups unbalanced | Charge costs + use caps; Classic mode always available. |
| Asset licensing | Only CC0/OFL or original assets; credits screen. |
| Scope creep | Future features are config-driven and explicitly out of MVP. |

---

## 24. Definition of Done (MVP)

- [ ] A player can install the Android APK, set a nickname/avatar, and play a complete
      game vs. Easy, Medium, and Hard bots fully offline.
- [ ] Two players on different devices can play a full online match via Quick Match or
      a Private Room code, with turn timer, and survive a brief disconnect.
- [ ] Hits show red markers + explosion; misses show X + splash; sunk ships reveal with
      chain explosion; all with sounds and haptics.
- [ ] Heavy Artillery and Sonar work in Arsenal mode for players and bots.
- [ ] Profile shows win/loss and accuracy; at least 12 badges can be unlocked.
- [ ] Engine and server test suites pass in CI; no opponent-fleet leak test passes.
- [ ] Runs at ~60 fps on a mid-range Android phone.

---

## 25. Expansion v2: Sizes, Shapes, Obstacles, Weapons

Agreed scope. Everything ships for **Vs Bot and Online**. Quick Match always uses standard
settings (Medium board, default obstacles); Private Rooms let the host choose everything.

### 25.1 Board sizes
- Presets: **Small 8×8**, **Medium 10×10** (default), **Large 12×12**, plus **Custom** square
  board via slider, **7–15**.
- Fleet is auto-scaled per size (`fleetForSize(n)`), ~15–20% of cells are ship cells:

| Size | Ship lengths |
|---|---|
| 7 | 4, 3, 2 |
| 8 | 4, 3, 3, 2 |
| 9 | 5, 4, 3, 2 |
| 10 | 5, 4, 3, 3, 2 (classic) |
| 11 | 5, 4, 4, 3, 3, 2 |
| 12 | 5, 4, 4, 3, 3, 2, 2 |
| 13 | 5, 5, 4, 4, 3, 3, 2, 2 |
| 14 | 6, 5, 4, 4, 3, 3, 3, 2, 2 |
| 15 | 6, 5, 4, 4, 3, 3, 3, 2, 2, 2 |

### 25.2 Ship shapes
- **Classic** mode keeps the straight-only fleet.
- **Arsenal** mode always uses a **mixed fleet**: straight ships plus **T**, **L** and **Z**
  tetromino ships (4 cells each), swapped in for some mid-size straight ships. All 4
  rotations are allowed for shaped ships.
- Ship art keeps the current realistic style, cleaned up; shaped ships get dedicated hulls.

### 25.3 Obstacles
Setting on game setup: **None / Few / Many** (scaled by board area). Layout is random per
board, with the same count and types for both players. Ships cannot be placed on obstacles.
Obstacles may touch ships.

| Obstacle | Size | Visible to enemy | Can be shot | Torpedo |
|---|---|---|---|---|
| Rock | 1 cell | Yes | No | Stops it |
| Island | 2–3 cell cluster | Yes | No | Stops it |
| Reef | 1 cell | Yes | Yes (counts as a miss) | Passes over |
| Mine | 1 cell | **No** (hidden) | Yes: shooter **skips their next turn** | Stops it, no penalty |

### 25.4 Weapons (Arsenal)
Charge: max 100, +20 per hit, +40 per sunk ship, +10 after 3 misses in a row (unchanged).
Suggested costs, open to tuning:

| Weapon | Effect | Cost | Uses/match |
|---|---|---|---|
| Heavy Artillery | Plus-shaped 5 cells (existing) | 100 | 2 |
| Sonar Scan | Counts ship cells in 3×3 (existing) | 60 | ∞ |
| Barrage | 4 random shots anywhere on unrevealed enemy cells | 50 | 2 |
| Airstrike | 4-cell line, player picks horizontal/vertical | 80 | 2 |
| Torpedo | Player picks row/column **and** start edge; travels until it hits the first ship cell; cells passed are marked empty | 70 | 2 |

### 25.5 Delivery phases
1. Board sizes (Vs Bot).
2. Ship shapes + refined ship art.
3. Obstacles.
4. New weapons (Barrage, Airstrike, Torpedo) incl. bot usage.
5. Online: private room settings, server validation, protocol updates.

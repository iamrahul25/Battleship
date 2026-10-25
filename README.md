# Battleship

A 2D naval combat strategy game for **Android and Web**. Place your fleet, take turns
firing at the enemy grid, and sink every enemy ship to win. Play **offline vs. bot**
(Easy / Medium / Hard) or **online 1v1** (Quick Match or Private Room code).

The full design is in [`plan.md`](./plan.md).

---

## Features

- **Modes:** *Advance* (default, power-ups and shaped ships) and *Classic* (standard shots only).
- **Power-ups (Advance mode):** hits, sinks and miss streaks fill a charge meter, which you spend on
  - **Torpedo** (50 charge, 2 per game): runs along a row or column and hits the first ship;
  - **Airstrike** (60 charge, 2 per game): a straight line of 4 cells;
  - **Barrage** (70 charge, 2 per game): 4 shells on random unrevealed cells;
  - **Sonar** (80 charge): scans a 3×3 area and reports how many ship cells it contains;
  - **Heavy Artillery** (100 charge, 2 per game): a plus-shaped 5-cell strike.
- **Rules toggles:** bonus shot on hit (on by default), ships may touch (off by default),
  offline turn timer (off by default; online turns are always 30 s).
- **Bots:** Easy (Cadet), Medium (Captain), Hard (Admiral), all playing by the same rules as you.
- **Online 1v1:** Quick Match, private 6-character room codes, 30 s reconnect window,
  rematch, quick emotes.
- **Presentation:** Skia-drawn ships, animated water, shell flights, explosions, splashes,
  screen shake, sonar sweeps, synthesized sound effects and music, haptics on Android.
- **Progression (stored on the device, no account):** profile with nickname and avatar,
  stats per mode and difficulty, rank titles, accuracy medals, and 12 achievements.
- **Resume:** an offline game in progress is saved and can be resumed from the home screen.

---

## Project structure

The repository has two independent folders:

| Folder | What it contains | How it runs |
|---|---|---|
| [`server/`](./server) | **All backend logic**: Colyseus rooms, matchmaking, turn timers, authoritative game state, plus the shared game engine and network protocol (`server/src/shared/`). | **One** Node.js process. Locally at `ws://localhost:2567`, later on a cloud host. |
| [`app/`](./app) | **All app & UI**: a single Expo (React Native) codebase for **Android and Web**, covering screens, battle grid, animations, sounds, and offline bot games. | **Any number of clients** (browser tabs, Android emulators, phones), all connected to the same server. |

```text
battleship/
├── README.md
├── plan.md
├── server/     # backend (single process)
│   └── src/
│       ├── rooms/          # BattleRoom + synced state schema
│       ├── services/       # room codes, rate limiting, logging
│       └── shared/         # pure TS, used by server AND app
│           ├── engine/     # rules, placement, attacks, win check, bots
│           └── protocol/   # message types + zod schemas
└── app/        # Android + Web client (Expo)
    ├── app/                # screens (Expo Router)
    ├── src/                # components, stores, game controllers, networking
    └── assets/             # images, sounds, fonts
```

The game rules live **only once**, in `server/src/shared/`. The app imports them through
the `@shared/*` path alias, so offline bot games and online games follow identical rules.

---

## Tech stack

- **App:** React Native + Expo + TypeScript (Android + Web via react-native-web)
- **UI & animation:** React Native Reanimated, Gesture Handler, React Native Skia
- **State:** Zustand (persisted with AsyncStorage / localStorage on web)
- **Online multiplayer:** Colyseus + Node.js
- **Game logic & bots:** pure TypeScript modules
- **Builds:** EAS Build (Android APK/AAB), `expo export` (Web)

---

## Prerequisites

- Node.js 20 LTS and npm
- For Android: Android Studio emulator, or the Expo Go / dev-client app on a phone
- A modern browser (Chrome, Edge, Firefox) for the web client

---

## Running locally

### 1. Start the server (once)

```bash
cd server
npm install
cp .env.example .env      # PORT=2567
npm run dev
```

The server listens on `ws://localhost:2567` (bound to `0.0.0.0` so devices on your Wi-Fi
can reach it). In dev mode, the Colyseus monitor at
<http://localhost:2567/colyseus> shows live rooms and connected players.

### 2. Start the app (in a second terminal)

```bash
cd app
npm install
cp .env.example .env      # leave EXPO_PUBLIC_SERVER_URL empty for local testing
npx expo start
```

From the Expo prompt:

- Press **`w`** to open the web app (`http://localhost:8081`).
- Press **`a`** to open it on a running Android emulator.
- Scan the QR code with a phone on the **same Wi-Fi** network.

When `EXPO_PUBLIC_SERVER_URL` is empty, the app finds the local server automatically:

| Client | Server URL used |
|---|---|
| Web browser | `ws://localhost:2567` |
| Android emulator | `ws://10.0.2.2:2567` |
| Physical phone | `ws://<your-PC-LAN-IP>:2567` (taken from the Expo dev server address) |

---

## Testing multiplayer with multiple users

Run **one server** and connect as many app clients as you want. Each client acts as a
separate player.

**Two players in the same browser:** tabs share storage, so give each tab its own
identity with the `player` URL parameter (dev builds only):

```text
http://localhost:8081/?player=alice
http://localhost:8081/?player=bob
```

Each `player` value gets its own profile, stats, and settings. Incognito windows or a
second browser work too.

**Mix platforms:** for example, one web tab + one Android emulator + one phone, all
playing against each other through the same local server.

**Typical test flows:**

1. *Quick Match:* both clients tap **Play Online → Quick Match** and get paired.
2. *Private Room:* client A taps **Create Room** and shares the 6-character code; client B
   taps **Join with Code** and enters it.
3. *Reconnect:* close or refresh one tab mid-game; reopen within 30 seconds to resume.

**Troubleshooting:**

- Phone can't connect: make sure the PC and phone are on the same Wi-Fi and allow port
  `2567` through Windows Firewall.
- Android emulator can't connect: it must use `10.0.2.2`, not `localhost` (handled
  automatically unless `EXPO_PUBLIC_SERVER_URL` is set).

---

## Offline play (no server needed)

**Play vs Bot** runs entirely on the device using the shared engine. The server does not
need to be running.

| Difficulty | Strategy |
|---|---|
| Easy (Cadet) | Mostly random shots |
| Medium (Captain) | Checkerboard hunting, then follows up around each hit |
| Hard (Admiral) | Fires at the cells most likely to contain a ship (never cheats) |

---

## Running the server in Docker

```bash
docker build -t battleship-server ./server
docker run --rm -p 2567:2567 battleship-server
```

## Deploying the server to the cloud

The server is deployed on [Render](https://render.com) from [`render.yaml`](./render.yaml)
(Docker, free plan, Singapore). Every push to `main` that touches `server/` redeploys it.

| Production backend | URL |
|---|---|
| WebSocket (used by the app) | `wss://battleship-iamrahul25.onrender.com` |
| HTTP base | <https://battleship-iamrahul25.onrender.com> |
| Health check | <https://battleship-iamrahul25.onrender.com/health> |

A healthy server responds with:

```json
{"ok":true,"protocolVersion":2,"uptime":33.57,"rooms":0}
```

The free plan sleeps after ~15 minutes without traffic; the first connection afterwards
takes ~30–60 s while it wakes up.

The `preview` EAS profile already points at the Render server, so building a shareable APK is:

```bash
cd app
npx eas-cli@latest build --profile preview --platform android
```

For a web build pointing at the same server:

```bash
EXPO_PUBLIC_SERVER_URL=wss://battleship-iamrahul25.onrender.com npx expo export --platform web
```

Local testing keeps working by leaving `EXPO_PUBLIC_SERVER_URL` unset.

### EAS build profiles (`app/eas.json`)

| Profile | Output | Use |
|---|---|---|
| `development` | Debug APK with the dev client | Local development on a device |
| `preview` | Release APK, internal distribution | Sharing test builds |
| `production` | App bundle (AAB), auto-incremented version | Play Store |

---

## Continuous integration

[`.github/workflows/ci.yml`](./.github/workflows/ci.yml) runs on every push and pull request:

- **server:** lint, typecheck, tests, bot simulation (fails if Hard isn't stronger than
  Medium, and Medium stronger than Easy), production build;
- **app:** lint, typecheck, Jest tests, web export;
- **docker:** builds the server image.

---

## Useful scripts

| Folder | Command | What it does |
|---|---|---|
| `server/` | `npm run dev` | Start server with auto-reload |
| `server/` | `npm run build && npm start` | Production build and run |
| `server/` | `npm test` | Engine, protocol, and room tests |
| `server/` | `npm run lint` / `npm run typecheck` | Static checks |
| `server/` | `npm run bot-sim` | Simulate bot games and report shots-to-win per difficulty |
| `app/` | `npx expo start` | Dev server (web / Android / phone) |
| `app/` | `npm run web` | Open the web app directly |
| `app/` | `npm run android` | Open on Android emulator |
| `app/` | `npm test` | App unit tests (progression, bot game controller, FX queue) |
| `app/` | `npm run lint` / `npm run typecheck` | Static checks |
| `app/` | `npm run build:web` | Static web build in `app/dist` |
| `app/` | `npm run generate-assets` | Regenerate the synthesized sounds, music and icons (Python 3) |

---

## Future features

- Custom grid sizes: Small (8×8), Medium (10×10), Large (12×12), Extra Large (15×15)
- Ships of different shapes and sizes
- More weapons and power-ups (Torpedo, Airstrike, Cluster Bomb, Shield, Decoy)
- Accounts, cloud stats, leaderboards, iOS build

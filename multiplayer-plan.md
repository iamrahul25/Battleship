# Multiplayer Private Rooms (2–6 players) — Plan

Extend **Private Room** so a host can open a battle for **2, 3, 4, 5 or 6 players**, either as a
**free-for-all** or as **teams** (2v2, 3v3, 2v2v2). Quick Match and offline bot games stay 1v1.

## 1. Decisions (agreed)

| Topic | Decision |
| --- | --- |
| Attack model | Free-for-all: on your turn pick **any surviving enemy** board and fire. Last fleet (or team) afloat wins. |
| Teams | Optional when creating the room: **2v2** (4 players), **3v3** or **2v2v2** (6 players). |
| Team assignment | **Random shuffle** when the battle starts (placement begins). |
| Team vision | Allies' boards (ships + damage) are visible read-only. Allies can't be targeted. |
| Team turn order | **Interleaved**: A1 → B1 → (C1) → A2 → B2 → … No team gets two turns in a row. |
| Room start | Host picks **max players (2–6)**. Auto-start when full; in free-for-all the host can tap **Start** early once 2+ have joined. Team formats need a full room. |
| Bonus shot on hit | **Kept** (same as 1v1). |
| Turn timer | **30 s** per turn (unchanged). Placement timer unchanged. |
| Eliminated players | Out of the game; can keep **spectating** (enemy fleets stay hidden) or leave. Rank shown at the end. |
| Stats | Only **1st place** (or every member of the winning team) records a win; everyone else a loss. |
| Layout | Phone: big focused board + tappable strip of mini boards. Wide screens: grid of all enemy boards, columns adapt to player count. 2-player rooms keep today's layout. |

## 2. Rules for N players

- **Seats** `0..N-1` are assigned in join order when the battle starts (compacted after lobby leaves).
- **Teams**: `teams[seat] = teamId`. Free-for-all = every seat is its own team.
- **Turn order**: free-for-all uses seat order; team games interleave team members. The first player is random. Eliminated players are skipped.
- **Fire / power-ups** take a `targetPlayer` seat. It must be alive, not you, and not an ally. In 1v1 it defaults to the only opponent (old clients keep working).
- **Hit** → bonus shot (you keep the turn and may switch target). **Miss** → turn passes to the next living player.
- **Mines**: hitting a mine makes the shooter skip their next turn. When the rotation reaches them, they are skipped once.
- **Elimination**: all ships sunk, forfeit, leaving, reconnect timeout, or 3 consecutive turn timeouts. The game continues while 2+ teams have a living player.
- **Victory**: one team left. Ranks: winners = 1; other teams ranked by elimination order (the last one eliminated gets 2nd).
- **Power-up charge** is per player. Sonar results are shown only to the shooter's team.
- **Information**: you see every enemy board's shots and sunk ships. Hidden ships are never sent to enemies until game end. Boards of eliminated players are revealed (they're out).

## 3. Phases

**Status:** all 8 phases are implemented. Server: 161 tests pass (25 of them new multiplayer tests); typecheck and lint are clean. App: typecheck, lint and the 29 jest tests pass. Manual testing (section 4) is still to do.

### Phase 1: Engine supports N players and teams (`server/src/shared/engine`)
- `PlayerIndex` becomes `number`. `GameState` gains `turnOrder`, `teams`, `eliminated`/`eliminationOrder`, and `winners`.
- `createGame(rules, seed, { players, teams })` defaults to 2 players (no change for bots/offline).
- Actions `FIRE` / `USE_WEAPON` get an optional `targetPlayer`. New error `INVALID_TARGET`.
- `ShotEvent.against` records the defender seat.
- Turn rotation, mine skips, eliminations, team victory, and standings live in the reducer.
- `PublicView` gains `players[]` (per seat: team, eliminated, public info, board: redacted enemy / full own+ally), `teams`, `turnOrder`, `winners`, and `standings`. `enemyBoard`/`enemy` still point at the first opponent for 1v1 compatibility.
- Old saved offline games load (missing fields are derived).
- Tests: 3-player and 4-player (2v2) games covering rotation, elimination, ally protection, mine skip, team win, and redaction.

### Phase 2: Protocol and server room
- Join options: `maxPlayers` (2–6) and `teamFormat` (`ffa | 2v2 | 3v3 | 2v2v2`), private rooms only. Team formats force 4/6.
- `PROTOCOL_VERSION = 3`; v2 clients are still accepted for 1v1 rooms and rejected (update prompt) for 3+ player rooms.
- Schema: `maxPlayers`, `teamFormat`, `hostSessionId` on the room; `team`, `eliminated`, `rank` per player.
- Host = first joiner (handed over if they leave the lobby). New `start` message lets the host start an FFA early (2+ players).
- Start: compact seats, shuffle teams, create an N-player game, lock the room.
- Leaving mid-game in a 3+ player game eliminates that player; the battle continues for the rest. Disconnect grace and timer pause work as today.
- Game over: per-player `youWon`, `rank`, `standings`, `winnerSessionIds`.
- Rematch: every connected player votes; players who left are dropped. Needs 2+ players; team formats need the full team count.
- Tests: 3-player FFA, 2v2 teams, host early start, leave = elimination, rematch with N players.

### Phase 3: Client plumbing
- `GameController.fire(target, targetPlayer?)` / `useWeapon(id, target, targetPlayer?)`, plus `startEarly()` for the host.
- `ControllerMeta` gains `seats[]` (name, avatar, seat, team, connected, eliminated, isHost, isMe, rematch), `maxPlayers`, `teamFormat`, and `isHost`. `opponent` stays for 1v1.
- The match store tracks `targetPlayer` and auto-picks a valid target when it becomes your turn. Shot fx carries the defender seat so the animation plays on the right board. Stamps read "SHIP SUNK!" / "SHIP LOST!" / "<name> lost a ship" / "<name> eliminated".

### Phase 4: Create-room and lobby UI
- **Private Room → New room settings**: `PLAYERS` (2 · 3 · 4 · 5 · 6) and `FORMAT` (Free-for-all / 2v2 / 3v3 / 2v2v2, shown only when valid).
- **Lobby**: room code + table + format, `joined/max` counter, and a responsive seat grid (2 columns on phones, 3 on wide screens) with empty "Waiting…" seats. The host sees **Start battle (N players)** in FFA once 2+ have joined; guests see "Waiting for host / room to fill".

### Phase 5: Placement screen
- 1v1 is unchanged. For 3+ players: a compact wrap row of every other player with READY / DEPLOYING, plus your team badge and teammates in team games.

### Phase 6: Battle screen (3+ players)
- **Phone (narrow)**:
  - Top: turn-order bar (avatar chips: active ring, team color, ships left, eliminated greyed) with the timer.
  - Middle: big focused board. On your turn it's your selected target (tap a chip or mini board to switch). Otherwise it follows the board being attacked so you see every shot land.
  - Below: horizontal strip of mini boards (you, allies, enemies). Sizes adapt to player count.
  - Then the power-up bar, status line, and the action buttons.
- **Wide (≥ 900 px)**: left column with your board (+ allies), power-ups and status; right side shows a grid of all enemy boards (1–2 enemies: 2 columns, 3–4: 2 columns, 5: 3 columns). Each is directly tappable on your turn, and the selected target is highlighted.
- **Spectator mode** after elimination: "You're out — spectating" banner plus a Leave button (no forfeit dialog).
- 2-player rooms keep the existing animated two-board layout.

### Phase 7: Result screen
- 3+ players: "1ST PLACE / VICTORY", "YOUR TEAM WON", or "4TH OF 6" stamp; a standings list (rank, avatar, name, team, how they went out); and a revealed-fleets grid with responsive columns.
- Rematch button shows votes (`3/5 ready`). Disabled when fewer than 2 players remain (or the team count is incomplete).
- Stats/achievements: win only for 1st / the winning team.

### Phase 8: Verify
- `server`: `npm test`, `npx tsc --noEmit`, lint. `app`: `npx tsc --noEmit`, `npx expo lint`, `npm test`.
- Manual test checklist (below).

## 4. Manual test checklist

Open several browser windows/tabs at `http://localhost:8081` (use a private window or a different nickname per tab if needed).

1. **1v1 regression**: create a private room with 2 players. The friend joins; the game plays exactly as before. Quick Match is unchanged.
2. **3-player FFA**: host picks 3 players / Free-for-all. Two friends join by code; the battle auto-starts when the third joins.
3. **Early start**: host picks 6 players. After 2–3 join, the host taps **Start battle**; guests cannot.
4. **Targeting**: on your turn, tap an enemy chip/mini board and fire at it. A hit keeps the turn (you can switch target); a miss passes to the next player.
5. **Elimination**: sink one player's whole fleet. They get the spectator banner and are skipped in turn order. Their board shows as revealed.
6. **Leave mid-battle** (3+ players): close a tab. That player is eliminated after the reconnect window and the battle continues.
7. **Teams 2v2**: 4 players, format 2v2. Teams are shown at placement; you can see your ally's board, you can't fire at the ally, and turns alternate teams. When one team is wiped out, both winners see VICTORY.
8. **Teams 3v3 / 2v2v2** with 6 tabs.
9. **Responsive**: resize the browser from phone width (~380 px) to desktop (≥ 1000 px) with 3, 4, 5 and 6 players. The strip/grid adapts without overflow.
10. **Result + rematch**: standings show correct ranks; rematch starts once all remaining players vote.

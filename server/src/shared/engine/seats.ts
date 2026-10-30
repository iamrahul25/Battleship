import type { GameState, PlayerIndex, PublicView, SeatView, Standing } from './types';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

export type TeamFormat = 'ffa' | '2v2' | '3v3' | '2v2v2';
export const TEAM_FORMATS: TeamFormat[] = ['ffa', '2v2', '3v3', '2v2v2'];

/** Team formats fix the room size; free-for-all takes any size. */
export const TEAM_LAYOUTS: Record<Exclude<TeamFormat, 'ffa'>, { teams: number; size: number }> = {
  '2v2': { teams: 2, size: 2 },
  '3v3': { teams: 2, size: 3 },
  '2v2v2': { teams: 3, size: 2 },
};

export function parseTeamFormat(value: unknown): TeamFormat {
  return TEAM_FORMATS.find((f) => f === value) ?? 'ffa';
}

export function playersForFormat(format: TeamFormat, requested: number): number {
  if (format !== 'ffa') return TEAM_LAYOUTS[format].teams * TEAM_LAYOUTS[format].size;
  return Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, Math.round(requested) || MIN_PLAYERS));
}

/** Team formats that fit a room of `players`. */
export function formatsFor(players: number): TeamFormat[] {
  return TEAM_FORMATS.filter((f) => f === 'ffa' || playersForFormat(f, 0) === players);
}

/** Team id per seat for seats already in team order (`[0,0,1,1]` for 2v2). */
export function teamsInOrder(format: TeamFormat, players: number): number[] | undefined {
  if (format === 'ffa') return undefined;
  const { size } = TEAM_LAYOUTS[format];
  return Array.from({ length: players }, (_, i) => Math.floor(i / size));
}

/** A1, B1, C1, A2, B2, … so no team ever takes two turns in a row. */
export function interleavedOrder(teams: number[]): PlayerIndex[] {
  const byTeam = new Map<number, PlayerIndex[]>();
  teams.forEach((t, p) => byTeam.set(t, [...(byTeam.get(t) ?? []), p]));
  const groups = [...byTeam.values()];
  const longest = Math.max(...groups.map((g) => g.length));
  const out: PlayerIndex[] = [];
  for (let i = 0; i < longest; i++) for (const g of groups) if (g[i] !== undefined) out.push(g[i]);
  return out;
}

export const seatsOf = (state: Pick<GameState, 'players'>): PlayerIndex[] => state.players.map((_, i) => i);

export function turnOrderOf(state: Pick<GameState, 'players' | 'turnOrder'>): PlayerIndex[] {
  return state.turnOrder ?? seatsOf(state);
}

export const teamOf = (state: Pick<GameState, 'teams'>, p: PlayerIndex): number => state.teams?.[p] ?? p;

export const isAlive = (state: Pick<GameState, 'players'>, p: PlayerIndex): boolean => !!state.players[p] && !state.players[p].out;

export function areAllies(state: Pick<GameState, 'teams'>, a: PlayerIndex, b: PlayerIndex): boolean {
  return a !== b && teamOf(state, a) === teamOf(state, b);
}

/** Seats `p` may fire at: other teams, still in the game. */
export function enemiesOf(state: Pick<GameState, 'players' | 'teams'>, p: PlayerIndex): PlayerIndex[] {
  return seatsOf(state).filter((q) => q !== p && !areAllies(state, p, q) && isAlive(state, q));
}

export function alliesOf(state: Pick<GameState, 'players' | 'teams'>, p: PlayerIndex): PlayerIndex[] {
  return seatsOf(state).filter((q) => areAllies(state, p, q));
}

export function livingTeams(state: Pick<GameState, 'players' | 'teams'>): number[] {
  return [...new Set(seatsOf(state).filter((p) => isAlive(state, p)).map((p) => teamOf(state, p)))];
}

/** True for 3+ player or team games (anything but a plain 1v1). */
export function isMultiplayerView(view: Pick<PublicView, 'players' | 'teamGame'>): boolean {
  return view.players.length > 2 || view.teamGame;
}

/** Enemy seats from the viewer's side, in turn order; knocked-out ones only when `includeOut`. */
export function viewEnemies(view: Pick<PublicView, 'players' | 'viewer' | 'turnOrder'>, includeOut = false): SeatView[] {
  const myTeam = view.players[view.viewer]?.team;
  const order = view.turnOrder.length ? view.turnOrder : view.players.map((p) => p.player);
  const start = Math.max(0, order.indexOf(view.viewer));
  const rotated = [...order.slice(start + 1), ...order.slice(0, start)];
  return rotated
    .map((p) => view.players[p])
    .filter((s): s is SeatView => !!s && s.player !== view.viewer && s.team !== myTeam && (includeOut || !s.out));
}

export function viewAllies(view: Pick<PublicView, 'players' | 'viewer'>): SeatView[] {
  const myTeam = view.players[view.viewer]?.team;
  return view.players.filter((s) => s.player !== view.viewer && s.team === myTeam);
}

/** Final ranking: the surviving team is 1st, then teams in reverse knock-out order. */
export function standings(state: GameState): Standing[] {
  const order = state.eliminated ?? [];
  const teams = [...new Set(seatsOf(state).map((p) => teamOf(state, p)))];
  const lastOut = (team: number) => {
    const members = seatsOf(state).filter((p) => teamOf(state, p) === team);
    if (members.some((p) => isAlive(state, p))) return order.length;
    return Math.max(...members.map((p) => order.indexOf(p)));
  };
  const ranked = teams.slice().sort((a, b) => lastOut(b) - lastOut(a));
  const rankOf = new Map(ranked.map((t, i) => [t, i + 1]));
  return seatsOf(state)
    .map((p) => ({ player: p, rank: rankOf.get(teamOf(state, p)) ?? ranked.length, out: state.players[p].out ?? null }))
    .sort((a, b) => a.rank - b.rank || a.player - b.player);
}

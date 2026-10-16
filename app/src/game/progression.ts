import type { Difficulty, FinishReason, GameMode } from '@shared/engine';

/** Everything the profile/achievement system needs to know about a finished match. */
export interface MatchSummary {
  kind: 'bot' | 'online';
  difficulty?: Difficulty;
  mode: GameMode;
  won: boolean;
  reason: FinishReason;
  shots: number;
  hits: number;
  shipsSunk: number;
  shipsLost: number;
  shipsTotal: number;
  powerUpsUsed: number;
  sunkWithArtillery: boolean;
  durationMs: number;
  opponentName: string;
}

export interface WinLoss {
  played: number;
  won: number;
  lost: number;
}

export interface StatsData {
  total: WinLoss;
  online: WinLoss;
  bot: Record<Difficulty, WinLoss>;
  shots: number;
  hits: number;
  currentStreak: number;
  bestStreak: number;
  fastestWinShots: number | null;
  fastestWinMs: number | null;
  shipsSunk: number;
  powerUpsUsed: number;
}

const emptyWl = (): WinLoss => ({ played: 0, won: 0, lost: 0 });

export function emptyStats(): StatsData {
  return {
    total: emptyWl(),
    online: emptyWl(),
    bot: { easy: emptyWl(), medium: emptyWl(), hard: emptyWl() },
    shots: 0,
    hits: 0,
    currentStreak: 0,
    bestStreak: 0,
    fastestWinShots: null,
    fastestWinMs: null,
    shipsSunk: 0,
    powerUpsUsed: 0,
  };
}

function bump(wl: WinLoss, won: boolean): WinLoss {
  return { played: wl.played + 1, won: wl.won + (won ? 1 : 0), lost: wl.lost + (won ? 0 : 1) };
}

export function applySummary(stats: StatsData, s: MatchSummary): StatsData {
  const next: StatsData = {
    ...stats,
    total: bump(stats.total, s.won),
    online: s.kind === 'online' ? bump(stats.online, s.won) : stats.online,
    bot: s.kind === 'bot' && s.difficulty ? { ...stats.bot, [s.difficulty]: bump(stats.bot[s.difficulty], s.won) } : stats.bot,
    shots: stats.shots + s.shots,
    hits: stats.hits + s.hits,
    shipsSunk: stats.shipsSunk + s.shipsSunk,
    powerUpsUsed: stats.powerUpsUsed + s.powerUpsUsed,
    currentStreak: s.won ? stats.currentStreak + 1 : 0,
  };
  next.bestStreak = Math.max(stats.bestStreak, next.currentStreak);
  // Forfeit wins don't count toward "fastest win" records.
  if (s.won && s.reason === 'sunk') {
    next.fastestWinShots = stats.fastestWinShots === null ? s.shots : Math.min(stats.fastestWinShots, s.shots);
    next.fastestWinMs = stats.fastestWinMs === null ? s.durationMs : Math.min(stats.fastestWinMs, s.durationMs);
  }
  return next;
}

export const accuracy = (shots: number, hits: number) => (shots > 0 ? hits / shots : 0);

// ---- Rank titles ----

export const RANKS = [
  { title: 'Recruit', wins: 0 },
  { title: 'Ensign', wins: 5 },
  { title: 'Lieutenant', wins: 15 },
  { title: 'Commander', wins: 30 },
  { title: 'Captain', wins: 60 },
  { title: 'Admiral', wins: 100 },
  { title: 'Fleet Admiral', wins: 200 },
] as const;

export function rankFor(wins: number) {
  let index = 0;
  RANKS.forEach((r, i) => {
    if (wins >= r.wins) index = i;
  });
  const next = RANKS[index + 1];
  return { title: RANKS[index].title, index, next: next ? { title: next.title, wins: next.wins } : null };
}

// ---- Medals ----

export type MedalTier = 'gold' | 'silver' | 'bronze';

export function medalFor(shots: number, hits: number): MedalTier | null {
  if (shots < 5) return null;
  const acc = accuracy(shots, hits);
  if (acc >= 0.6) return 'gold';
  if (acc >= 0.45) return 'silver';
  if (acc >= 0.3) return 'bronze';
  return null;
}

// ---- Achievements ----

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  tier: MedalTier;
  icon: 'blood' | 'anchor' | 'trophy' | 'crosshair' | 'shield' | 'phoenix' | 'chevron1' | 'chevron2' | 'chevron3' | 'globe' | 'cannon' | 'flame';
  /** Progress towards unlocking: [current, target]. */
  progress?: (stats: StatsData) => [number, number];
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_blood', name: 'First Blood', description: 'Get your first hit.', tier: 'bronze', icon: 'blood' },
  {
    id: 'maiden_voyage',
    name: 'Maiden Voyage',
    description: 'Finish your first game.',
    tier: 'bronze',
    icon: 'anchor',
    progress: (s) => [Math.min(s.total.played, 1), 1],
  },
  {
    id: 'victory_at_sea',
    name: 'Victory at Sea',
    description: 'Win your first game.',
    tier: 'bronze',
    icon: 'trophy',
    progress: (s) => [Math.min(s.total.won, 1), 1],
  },
  { id: 'sharpshooter', name: 'Sharpshooter', description: 'Win with at least 60% accuracy.', tier: 'gold', icon: 'crosshair' },
  { id: 'untouchable', name: 'Untouchable', description: 'Win without losing a ship.', tier: 'gold', icon: 'shield' },
  { id: 'comeback_admiral', name: 'Comeback Admiral', description: 'Win with only 1 ship left.', tier: 'silver', icon: 'phoenix' },
  {
    id: 'cadet_crusher',
    name: 'Cadet Crusher',
    description: 'Beat the Easy bot 5 times.',
    tier: 'bronze',
    icon: 'chevron1',
    progress: (s) => [Math.min(s.bot.easy.won, 5), 5],
  },
  {
    id: 'captains_bane',
    name: "Captain's Bane",
    description: 'Beat the Medium bot.',
    tier: 'silver',
    icon: 'chevron2',
    progress: (s) => [Math.min(s.bot.medium.won, 1), 1],
  },
  {
    id: 'admiral_slayer',
    name: 'Admiral Slayer',
    description: 'Beat the Hard bot.',
    tier: 'gold',
    icon: 'chevron3',
    progress: (s) => [Math.min(s.bot.hard.won, 1), 1],
  },
  {
    id: 'online_warrior',
    name: 'Online Warrior',
    description: 'Win 10 online games.',
    tier: 'gold',
    icon: 'globe',
    progress: (s) => [Math.min(s.online.won, 10), 10],
  },
  { id: 'big_guns', name: 'Big Guns', description: 'Sink a ship using Heavy Artillery.', tier: 'silver', icon: 'cannon' },
  {
    id: 'streak_of_steel',
    name: 'Streak of Steel',
    description: 'Win 5 games in a row.',
    tier: 'gold',
    icon: 'flame',
    progress: (s) => [Math.min(s.bestStreak, 5), 5],
  },
];

export const achievementById = (id: string) => ACHIEVEMENTS.find((a) => a.id === id);

/** Ids that the finished match (with stats already updated) satisfies. */
export function earnedAchievements(summary: MatchSummary, stats: StatsData): string[] {
  const ids: string[] = [];
  const acc = accuracy(summary.shots, summary.hits);
  if (stats.hits > 0) ids.push('first_blood');
  if (stats.total.played > 0) ids.push('maiden_voyage');
  if (stats.total.won > 0) ids.push('victory_at_sea');
  const realWin = summary.won && summary.reason === 'sunk';
  if (realWin && acc >= 0.6) ids.push('sharpshooter');
  if (realWin && summary.shipsLost === 0) ids.push('untouchable');
  if (realWin && summary.shipsTotal - summary.shipsLost === 1) ids.push('comeback_admiral');
  if (stats.bot.easy.won >= 5) ids.push('cadet_crusher');
  if (stats.bot.medium.won >= 1) ids.push('captains_bane');
  if (stats.bot.hard.won >= 1) ids.push('admiral_slayer');
  if (stats.online.won >= 10) ids.push('online_warrior');
  if (summary.sunkWithArtillery) ids.push('big_guns');
  if (stats.bestStreak >= 5) ids.push('streak_of_steel');
  return ids;
}

import {
  applySummary,
  earnedAchievements,
  emptyStats,
  type MatchSummary,
  medalFor,
  rankFor,
} from '../progression';

const summary = (over: Partial<MatchSummary> = {}): MatchSummary => ({
  kind: 'bot',
  difficulty: 'easy',
  mode: 'arsenal',
  won: true,
  reason: 'sunk',
  shots: 40,
  hits: 17,
  shipsSunk: 5,
  shipsLost: 2,
  shipsTotal: 5,
  powerUpsUsed: 1,
  sunkWithArtillery: false,
  durationMs: 120_000,
  opponentName: 'Cadet',
  ...over,
});

describe('applySummary', () => {
  it('tracks totals, per-difficulty records and streaks', () => {
    let s = emptyStats();
    s = applySummary(s, summary());
    s = applySummary(s, summary({ difficulty: 'hard' }));
    s = applySummary(s, summary({ won: false, difficulty: 'hard' }));
    expect(s.total).toEqual({ played: 3, won: 2, lost: 1 });
    expect(s.bot.easy).toEqual({ played: 1, won: 1, lost: 0 });
    expect(s.bot.hard).toEqual({ played: 2, won: 1, lost: 1 });
    expect(s.online.played).toBe(0);
    expect(s.currentStreak).toBe(0);
    expect(s.bestStreak).toBe(2);
    expect(s.shots).toBe(120);
    expect(s.hits).toBe(51);
  });

  it('records online games separately', () => {
    const s = applySummary(emptyStats(), summary({ kind: 'online', difficulty: undefined }));
    expect(s.online).toEqual({ played: 1, won: 1, lost: 0 });
    expect(s.bot.easy.played).toBe(0);
  });

  it('keeps the fastest win and ignores forfeit wins', () => {
    let s = applySummary(emptyStats(), summary({ shots: 50, durationMs: 200_000 }));
    s = applySummary(s, summary({ shots: 35, durationMs: 300_000 }));
    expect(s.fastestWinShots).toBe(35);
    expect(s.fastestWinMs).toBe(200_000);
    s = applySummary(s, summary({ shots: 3, durationMs: 5_000, reason: 'forfeit' }));
    expect(s.fastestWinShots).toBe(35);
    expect(s.fastestWinMs).toBe(200_000);
  });
});

describe('ranks and medals', () => {
  it('maps wins to rank titles', () => {
    expect(rankFor(0).title).toBe('Recruit');
    expect(rankFor(4).next).toEqual({ title: 'Ensign', wins: 5 });
    expect(rankFor(5).title).toBe('Ensign');
    expect(rankFor(250)).toMatchObject({ title: 'Fleet Admiral', next: null });
  });

  it('awards medals by accuracy', () => {
    expect(medalFor(4, 4)).toBeNull();
    expect(medalFor(10, 6)).toBe('gold');
    expect(medalFor(20, 9)).toBe('silver');
    expect(medalFor(10, 3)).toBe('bronze');
    expect(medalFor(10, 2)).toBeNull();
  });
});

describe('earnedAchievements', () => {
  it('unlocks match-based badges only for real wins', () => {
    const perfect = summary({ shots: 20, hits: 17, shipsLost: 0 });
    const ids = earnedAchievements(perfect, applySummary(emptyStats(), perfect));
    expect(ids).toEqual(expect.arrayContaining(['first_blood', 'maiden_voyage', 'victory_at_sea', 'sharpshooter', 'untouchable']));
    expect(ids).not.toContain('comeback_admiral');

    const forfeit = summary({ shots: 20, hits: 17, shipsLost: 0, reason: 'forfeit' });
    const fids = earnedAchievements(forfeit, applySummary(emptyStats(), forfeit));
    expect(fids).not.toContain('sharpshooter');
    expect(fids).not.toContain('untouchable');
  });

  it('unlocks comeback, artillery and bot badges', () => {
    const s = summary({ difficulty: 'hard', shipsLost: 4, sunkWithArtillery: true });
    const ids = earnedAchievements(s, applySummary(emptyStats(), s));
    expect(ids).toEqual(expect.arrayContaining(['comeback_admiral', 'big_guns', 'admiral_slayer']));
  });

  it('needs five easy wins for Cadet Crusher', () => {
    let stats = emptyStats();
    for (let i = 0; i < 4; i++) stats = applySummary(stats, summary());
    expect(earnedAchievements(summary(), stats)).not.toContain('cadet_crusher');
    stats = applySummary(stats, summary());
    expect(earnedAchievements(summary(), stats)).toEqual(expect.arrayContaining(['cadet_crusher', 'streak_of_steel']));
  });
});

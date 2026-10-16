import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { applySummary, emptyStats, type MatchSummary, type StatsData } from '@/game/progression';
import { zustandStorage } from '@/platform/storage';

interface StatsState extends StatsData {
  record: (summary: MatchSummary) => StatsData;
  reset: () => void;
}

const pickData = (s: StatsState): StatsData => ({
  total: s.total,
  online: s.online,
  bot: s.bot,
  shots: s.shots,
  hits: s.hits,
  currentStreak: s.currentStreak,
  bestStreak: s.bestStreak,
  fastestWinShots: s.fastestWinShots,
  fastestWinMs: s.fastestWinMs,
  shipsSunk: s.shipsSunk,
  powerUpsUsed: s.powerUpsUsed,
});

export const useStatsStore = create<StatsState>()(
  persist(
    (set, get) => ({
      ...emptyStats(),
      record: (summary) => {
        const next = applySummary(pickData(get()), summary);
        set(next);
        return next;
      },
      reset: () => set(emptyStats()),
    }),
    {
      name: 'stats.v1',
      version: 1,
      storage: createJSONStorage(() => zustandStorage),
      migrate: (persisted) => ({ ...emptyStats(), ...(persisted as object) }),
    },
  ),
);

export const selectStats = (s: StatsState) => pickData(s);

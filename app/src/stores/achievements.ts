import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { zustandStorage } from '@/platform/storage';

interface AchievementsState {
  /** Achievement id → unlock timestamp. */
  unlocked: Record<string, number>;
  /** Unlocks the given ids and returns only the ones that are new. */
  unlock: (ids: string[]) => string[];
  reset: () => void;
}

export const useAchievementsStore = create<AchievementsState>()(
  persist(
    (set, get) => ({
      unlocked: {},
      unlock: (ids) => {
        const current = get().unlocked;
        const fresh = ids.filter((id) => !current[id]);
        if (fresh.length) {
          const now = Date.now();
          set({ unlocked: { ...current, ...Object.fromEntries(fresh.map((id) => [id, now])) } });
        }
        return fresh;
      },
      reset: () => set({ unlocked: {} }),
    }),
    {
      name: 'achievements.v1',
      version: 1,
      storage: createJSONStorage(() => zustandStorage),
      migrate: (persisted) => ({ unlocked: {}, ...(persisted as object) }),
    },
  ),
);

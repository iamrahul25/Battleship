import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { GameMode } from '@shared/engine';
import { zustandStorage } from '@/platform/storage';

export interface SettingsState {
  soundVolume: number;
  musicVolume: number;
  haptics: boolean;
  /** Optional 30 s turn timer in bot games. */
  offlineTimer: boolean;
  bonusShotOnHit: boolean;
  allowTouching: boolean;
  defaultMode: GameMode;
  reducedMotion: boolean;
  set: (patch: Partial<Omit<SettingsState, 'set' | 'reset'>>) => void;
  reset: () => void;
}

export const DEFAULT_SETTINGS = {
  soundVolume: 0.8,
  musicVolume: 0.5,
  haptics: true,
  offlineTimer: false,
  bonusShotOnHit: true,
  allowTouching: false,
  defaultMode: 'arsenal' as GameMode,
  reducedMotion: false,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      set: (patch) => set(patch),
      reset: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: 'settings.v1',
      version: 1,
      storage: createJSONStorage(() => zustandStorage),
      migrate: (persisted) => ({ ...DEFAULT_SETTINGS, ...(persisted as object) }),
    },
  ),
);

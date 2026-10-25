import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DEFAULT_BOARD_SIZE, type GameMode, type ObstacleLevel, parseGameMode } from '@shared/engine';
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
  /** Last board size chosen for bot games (n×n). */
  boardSize: number;
  /** Last obstacle density chosen for bot games. */
  obstacles: ObstacleLevel;
  reducedMotion: boolean;
  /** Picture sprites for ships; off falls back to the simple drawn art. */
  imageGraphics: boolean;
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
  defaultMode: 'advance' as GameMode,
  boardSize: DEFAULT_BOARD_SIZE,
  obstacles: 'few' as ObstacleLevel,
  reducedMotion: false,
  imageGraphics: true,
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
      // v2: the Advance mode id changed, so v1 `defaultMode` values must be re-parsed.
      version: 2,
      storage: createJSONStorage(() => zustandStorage),
      migrate: (persisted) => {
        const saved = (persisted ?? {}) as Partial<typeof DEFAULT_SETTINGS>;
        return { ...DEFAULT_SETTINGS, ...saved, defaultMode: parseGameMode(saved.defaultMode ?? DEFAULT_SETTINGS.defaultMode) };
      },
    },
  ),
);

import { useSyncExternalStore } from 'react';
import { useAchievementsStore } from './achievements';
import { useProfileStore } from './profile';
import { useSettingsStore } from './settings';
import { useStatsStore } from './stats';

const stores = [useSettingsStore, useProfileStore, useStatsStore, useAchievementsStore];

const allHydrated = () => stores.every((s) => s.persist.hasHydrated());

const subscribe = (cb: () => void) => {
  const unsubs = stores.map((s) => s.persist.onFinishHydration(cb));
  return () => unsubs.forEach((u) => u());
};

/** True once every persisted store has loaded from AsyncStorage/localStorage. */
export function useHydrated() {
  return useSyncExternalStore(subscribe, allHydrated, allHydrated);
}

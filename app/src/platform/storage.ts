import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type { StateStorage } from 'zustand/middleware';

/**
 * In web dev builds `?player=alice` gives each browser tab its own profile/stats so two
 * tabs can play each other online. Read once at startup since the router drops the query.
 */
function readNamespace(): string {
  if (Platform.OS !== 'web' || !__DEV__ || typeof window === 'undefined') return '';
  const raw = new URLSearchParams(window.location.search).get('player') ?? '';
  return raw.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 20);
}

export const storageNamespace = readNamespace();

export const storageKey = (name: string) => (storageNamespace ? `bs.${storageNamespace}.${name}` : `bs.${name}`);

export const zustandStorage: StateStorage = {
  getItem: (name) => AsyncStorage.getItem(storageKey(name)),
  setItem: (name, value) => AsyncStorage.setItem(storageKey(name), value),
  removeItem: (name) => AsyncStorage.removeItem(storageKey(name)),
};

export async function readJson<T>(name: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(name));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function writeJson(name: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey(name), JSON.stringify(value));
  } catch {
    // Storage full or unavailable: persistence is best-effort.
  }
}

export async function removeKey(name: string): Promise<void> {
  await AsyncStorage.removeItem(storageKey(name)).catch(() => undefined);
}

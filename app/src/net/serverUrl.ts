import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Resolution order: EXPO_PUBLIC_SERVER_URL → app.config extra.serverUrl → dev fallbacks
 * (same host as the web page, Android emulator loopback, or the Metro host IP on a device).
 */
export function getServerUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_SERVER_URL || (Constants.expoConfig?.extra?.serverUrl as string | undefined);
  if (explicit) return explicit.replace(/\/$/, '');

  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.location?.hostname) {
      const secure = window.location.protocol === 'https:';
      return `${secure ? 'wss' : 'ws'}://${window.location.hostname}:2567`;
    }
    return 'ws://localhost:2567';
  }

  const hostUri = Constants.expoConfig?.hostUri ?? '';
  const host = hostUri.split(':')[0];
  if (host && host !== 'localhost' && host !== '127.0.0.1') return `ws://${host}:2567`;
  return Platform.OS === 'android' ? 'ws://10.0.2.2:2567' : 'ws://localhost:2567';
}

export function getHttpUrl(): string {
  return getServerUrl().replace(/^ws/, 'http');
}

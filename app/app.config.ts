import type { ConfigContext, ExpoConfig } from 'expo/config';

const serverUrl = process.env.EXPO_PUBLIC_SERVER_URL ?? '';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Battleship',
  slug: 'battleship',
  version: '1.0.0',
  scheme: 'battleship',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  userInterfaceStyle: 'dark',
  backgroundColor: '#0A1628',
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.battleship.game',
  },
  android: {
    package: 'com.battleship.game',
    versionCode: 1,
    adaptiveIcon: {
      backgroundColor: '#0A1628',
      foregroundImage: './assets/images/adaptive-icon.png',
    },
    predictiveBackGestureEnabled: false,
    permissions: ['VIBRATE'],
    blockedPermissions: ['android.permission.RECORD_AUDIO'],
  },
  web: {
    favicon: './assets/images/favicon.png',
    output: 'single',
    name: 'Battleship',
    themeColor: '#0A1628',
    backgroundColor: '#0A1628',
  },
  plugins: [
    'expo-router',
    'expo-status-bar',
    ['expo-audio', { microphonePermission: false, recordAudioAndroid: false, enableBackgroundPlayback: false }],
    'expo-font',
    [
      'expo-splash-screen',
      {
        image: './assets/images/splash-icon.png',
        imageWidth: 220,
        resizeMode: 'contain',
        backgroundColor: '#0A1628',
      },
    ],
  ],
  experiments: {
    typedRoutes: false,
  },
  extra: {
    serverUrl,
  },
});

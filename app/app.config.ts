import type { ConfigContext, ExpoConfig } from 'expo/config';
import { type ConfigPlugin, withGradleProperties } from 'expo/config-plugins';

const serverUrl = process.env.EXPO_PUBLIC_SERVER_URL ?? '';

// Expo defaults CMAKE_OBJECT_PATH_MAX to 1024, which assumes Windows long-path support. Without it,
// AGP's bundled Ninja 1.10 fails on deep native object paths (reanimated, gesture-handler codegen)
// once they pass MAX_PATH (260). Below this limit CMake hashes long object paths. CMake's own Windows
// default (250) is too strict to fit gesture-handler's longest file name even after hashing, and the
// limit must stay <= 257 so Ninja's `<object>.d` depfile still fits under 260.
const CMAKE_OBJECT_PATH_MAX_KEY = 'expo.android.cmakeObjectPathMax';
const CMAKE_OBJECT_PATH_MAX = '256';
const withCmakeObjectPathMax: ConfigPlugin = (config) =>
  withGradleProperties(config, (cfg) => {
    cfg.modResults = cfg.modResults.filter(
      (item) => !(item.type === 'property' && item.key === CMAKE_OBJECT_PATH_MAX_KEY),
    );
    cfg.modResults.push({ type: 'property', key: CMAKE_OBJECT_PATH_MAX_KEY, value: CMAKE_OBJECT_PATH_MAX });
    return cfg;
  });

export default ({ config }: ConfigContext): ExpoConfig => withCmakeObjectPathMax({
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

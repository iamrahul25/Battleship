import type { ConfigContext, ExpoConfig } from 'expo/config';
import {
  type ConfigPlugin,
  withAppBuildGradle,
  withGradleProperties,
  withProjectBuildGradle,
} from 'expo/config-plugins';

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

// A single clang++ compiling react-native-skia (e.g. RNSkManager.cpp) peaks near 3 GB. By default
// Ninja runs (cores + 2) compiles per ABI and Gradle builds several ABIs/libraries at once, which
// exhausts RAM on a 16 GB machine and clang dies with "clang frontend command failed due to signal".
// Run one CMake build task at a time and cap each Ninja to ~1 compile per 6 GB of RAM; override with
// `-Pbattleship.nativeCompileJobs=N`.
const NATIVE_COMPILE_JOBS_KEY = 'battleship.nativeCompileJobs';
const NATIVE_BUILD_LIMIT_MARKER = '// battleship: limit native build parallelism';
const NATIVE_BUILD_LIMIT_GRADLE = `
${NATIVE_BUILD_LIMIT_MARKER}
abstract class NativeBuildLimiter implements org.gradle.api.services.BuildService<org.gradle.api.services.BuildServiceParameters.None> {}
def nativeBuildLimiter = gradle.sharedServices.registerIfAbsent('nativeBuildLimiter', NativeBuildLimiter) {
  it.maxParallelUsages.set(1)
}
def totalRamGb = java.lang.management.ManagementFactory.operatingSystemMXBean.totalMemorySize / (1024 ** 3)
def defaultNativeCompileJobs = Math.max(1, Math.min(Runtime.runtime.availableProcessors(), (int) (totalRamGb / 6)))
def nativeCompileJobs = (findProperty('${NATIVE_COMPILE_JOBS_KEY}') ?: defaultNativeCompileJobs).toString().toInteger()
logger.quiet("[battleship] Native builds: one CMake task at a time, \${nativeCompileJobs} parallel compile(s) each")
allprojects { project ->
  project.pluginManager.withPlugin('com.android.base') {
    project.android.defaultConfig.externalNativeBuild.cmake.arguments.addAll([
      "-DCMAKE_JOB_POOLS=compile=\${nativeCompileJobs}".toString(),
      '-DCMAKE_JOB_POOL_COMPILE=compile',
    ])
    project.tasks.matching { it.name.startsWith('buildCMake') }.configureEach { usesService(nativeBuildLimiter) }
  }
}
`;
const withNativeBuildLimit: ConfigPlugin = (config) =>
  withProjectBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes(NATIVE_BUILD_LIMIT_MARKER)) {
      cfg.modResults.contents += NATIVE_BUILD_LIMIT_GRADLE;
    }
    return cfg;
  });

// Release builds are signed with the Play Store upload key when MYAPP_UPLOAD_* is in Gradle's
// environment (scripts/build-apk.js passes it from app/.env for `aab` builds only), and fall back
// to the debug keystore otherwise so sideloaded APKs keep updating over earlier installs.
const UPLOAD_SIGNING_CONFIG = `
        release {
            if (System.getenv('MYAPP_UPLOAD_STORE_FILE')) {
                storeFile file(System.getenv('MYAPP_UPLOAD_STORE_FILE'))
                storePassword System.getenv('MYAPP_UPLOAD_STORE_PASSWORD')
                keyAlias System.getenv('MYAPP_UPLOAD_KEY_ALIAS')
                keyPassword System.getenv('MYAPP_UPLOAD_KEY_PASSWORD')
            }
        }`;
const withUploadSigning: ConfigPlugin = (config) =>
  withAppBuildGradle(config, (cfg) => {
    let gradle = cfg.modResults.contents;
    if (gradle.includes('MYAPP_UPLOAD_STORE_FILE')) return cfg;
    gradle = gradle.replace(
      /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/,
      "$1signingConfig System.getenv('MYAPP_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug",
    );
    gradle = gradle.replace(/signingConfigs\s*\{/, (match) => match + UPLOAD_SIGNING_CONFIG);
    if (!gradle.includes('signingConfigs.release')) {
      throw new Error('withUploadSigning: could not find the release signingConfig in android/app/build.gradle');
    }
    cfg.modResults.contents = gradle;
    return cfg;
  });

export default ({ config }: ConfigContext): ExpoConfig => withNativeBuildLimit(withUploadSigning(withCmakeObjectPathMax({
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
})));

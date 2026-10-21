const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const MIN_JAVA_MAJOR = 17;
const RULE = '═'.repeat(50);
const PREBUILD_HINT = 'Run from app/: npx expo prebuild --platform android';

function createReporter() {
  const problems = [];
  const warnings = [];
  const printHint = (hint) => {
    const lines = Array.isArray(hint) ? hint : [hint];
    lines.forEach((line) => console.log(`       ${line}`));
  };
  return {
    problems,
    warnings,
    section(title) {
      console.log(`\n${title}`);
    },
    pass(message) {
      console.log(`  ✅ ${message}`);
    },
    warn(message, hint) {
      warnings.push(message);
      console.log(`  ⚠️  ${message}`);
      if (hint) printHint(hint);
    },
    fail(message, hint) {
      problems.push(message);
      console.log(`  ❌ ${message}`);
      if (hint) printHint(hint);
    },
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function unescapeProperty(value) {
  return value.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, c) => {
    if (c.length === 5) return String.fromCharCode(parseInt(c.slice(1), 16));
    return { t: '\t', n: '\n', r: '\r', f: '\f' }[c] ?? c;
  });
}

/** Parses a Java `.properties` file (the format Gradle uses for local.properties). */
function parseProperties(text) {
  const result = {};
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].replace(/^\s+/, '');
    if (!line || line[0] === '#' || line[0] === '!') continue;
    while (/(^|[^\\])(\\\\)*\\$/.test(line) && i + 1 < lines.length) {
      line = line.slice(0, -1) + lines[++i].replace(/^\s+/, '');
    }
    const match = line.match(/^((?:\\.|[^=:\s\\])*)\s*[=:\s]\s*(.*)$/);
    const key = unescapeProperty(match ? match[1] : line);
    result[key] = match ? unescapeProperty(match[2]) : '';
  }
  return result;
}

function readPropertiesFile(filePath) {
  return fs.existsSync(filePath) ? parseProperties(fs.readFileSync(filePath, 'utf8')) : null;
}

function run(command, args, options = {}) {
  return spawnSync(command, args, { encoding: 'utf8', windowsHide: true, ...options });
}

function outputOf(result) {
  return `${result.stdout || ''}\n${result.stderr || ''}`.trim();
}

function jdkTool(tool) {
  const exe = process.platform === 'win32' ? `${tool}.exe` : tool;
  const javaHome = process.env.JAVA_HOME;
  if (javaHome && fs.existsSync(path.join(javaHome, 'bin', exe))) {
    return path.join(javaHome, 'bin', exe);
  }
  return tool;
}

function tryRequire(id, fromDir) {
  try {
    return require(require.resolve(id, { paths: [fromDir] }));
  } catch {
    return null;
  }
}

function checkProject(ctx, report) {
  const { rootDir, androidDir, appDir } = ctx;
  report.section('📁 Project');

  try {
    readJson(path.join(rootDir, 'package.json'));
    report.pass('package.json');
  } catch (error) {
    report.fail('package.json is missing or invalid', error.message);
  }

  const expoConfig = tryRequire('expo/config', rootDir);
  if (!expoConfig) {
    report.warn('Could not load expo/config, skipping app.config.ts check', 'npm install runs next and should fix this.');
  } else {
    try {
      const { exp } = expoConfig.getConfig(rootDir, { skipSDKVersionRequirement: true });
      ctx.androidPackage = exp?.android?.package;
      if (ctx.androidPackage) {
        const versionCode = exp.android.versionCode ?? 1;
        report.pass(`app.config.ts (android.package: ${ctx.androidPackage}, version ${exp.version}, versionCode ${versionCode})`);
        if (ctx.target === 'aab') {
          const [major, minor, patch] = String(exp.version).split('.').map(Number);
          console.log(`       The AAB build bumps this to ${major}.${minor}.${patch + 1} (versionCode ${versionCode + 1}).`);
        }
      } else {
        report.fail('app.config.ts has no android.package');
      }
    } catch (error) {
      report.fail('app.config.ts could not be evaluated', error.message.split('\n')[0]);
    }
  }

  if (!fs.existsSync(androidDir)) {
    report.warn('android/ folder not found yet', 'The APK build generates it with expo prebuild.');
    return;
  }

  const gradlew = process.platform === 'win32' ? 'gradlew.bat' : 'gradlew';
  const requiredFiles = [
    `android/${gradlew}`,
    'android/settings.gradle',
    'android/build.gradle',
    'android/app/build.gradle',
    'android/gradle/wrapper/gradle-wrapper.properties',
  ];
  const missing = requiredFiles.filter((file) => !fs.existsSync(path.join(rootDir, file)));
  if (missing.length) {
    report.fail(`Android project incomplete, missing: ${missing.join(', ')}`, [
      `Delete app/android and regenerate it. ${PREBUILD_HINT}`,
    ]);
    return;
  }
  report.pass('Android project and Gradle wrapper');

  const appGradle = fs.readFileSync(path.join(appDir, 'build.gradle'), 'utf8');
  const applicationId = appGradle.match(/applicationId\s+['"]([^'"]+)['"]/)?.[1];
  if (ctx.androidPackage && applicationId && applicationId !== ctx.androidPackage) {
    report.warn(
      `android/app/build.gradle applicationId (${applicationId}) differs from app.config.ts (${ctx.androidPackage})`,
      `The android/ folder may be stale. ${PREBUILD_HINT}`
    );
  }

  if (ctx.target === 'aab') return;

  // APKs are signed with the debug keystore; only the aab target uses the upload key.
  if (fs.existsSync(path.join(appDir, 'debug.keystore'))) {
    report.pass('Signing: android/app/debug.keystore (fine for sideloading, not for the Play Store)');
  } else {
    report.fail('android/app/debug.keystore not found', PREBUILD_HINT);
  }
}

function checkToolchain(ctx, report) {
  const { rootDir, androidDir } = ctx;
  report.section('⚙️  Toolchain');

  const rnPackage = tryRequire('react-native/package.json', rootDir);
  const semver = tryRequire('semver', rootDir);
  const nodeRange = rnPackage?.engines?.node;
  if (nodeRange && semver && !semver.satisfies(process.versions.node, nodeRange)) {
    report.fail(`Node.js ${process.versions.node} does not satisfy react-native's "${nodeRange}"`);
  } else {
    report.pass(`Node.js ${process.versions.node}`);
  }

  const javaHome = process.env.JAVA_HOME;
  const javaExe = process.platform === 'win32' ? 'java.exe' : 'java';
  if (javaHome && !fs.existsSync(path.join(javaHome, 'bin', javaExe))) {
    report.fail(`JAVA_HOME points to an invalid JDK: ${javaHome}`, 'Set JAVA_HOME to a JDK 17+ install folder.');
  } else {
    const result = run(jdkTool('java'), ['-version']);
    const versionText = outputOf(result);
    const match = versionText.match(/version "(\d+)(?:\.(\d+))?/);
    if (result.error || !match) {
      report.fail('Java not found', `Install JDK ${MIN_JAVA_MAJOR}+ and set JAVA_HOME.`);
    } else {
      const major = match[1] === '1' ? Number(match[2]) : Number(match[1]);
      if (major < MIN_JAVA_MAJOR) {
        report.fail(`Java ${major} found, but Gradle needs JDK ${MIN_JAVA_MAJOR}+`, `Current: ${versionText.split('\n')[0]}`);
      } else {
        report.pass(`Java ${versionText.split('\n')[0].match(/"([^"]+)"/)?.[1] ?? major}`);
      }
    }
  }

  const localProps = readPropertiesFile(path.join(androidDir, 'local.properties'));
  const sdkDir = localProps?.['sdk.dir'] || process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (!sdkDir) {
    report.fail('Android SDK location not set', 'Set ANDROID_HOME, or sdk.dir in android/local.properties.');
  } else if (!fs.existsSync(path.join(sdkDir, 'platforms'))) {
    report.fail(`Android SDK not found at ${sdkDir}`, 'Install the SDK via Android Studio and fix ANDROID_HOME.');
  } else {
    report.pass(`Android SDK (${sdkDir})`);
    if (!fs.existsSync(path.join(sdkDir, 'licenses', 'android-sdk-license'))) {
      report.warn('Android SDK licenses not accepted', 'Run: sdkmanager --licenses');
    }
  }
}

const UPLOAD_KEY_VARS = [
  'MYAPP_UPLOAD_STORE_FILE',
  'MYAPP_UPLOAD_KEY_ALIAS',
  'MYAPP_UPLOAD_STORE_PASSWORD',
  'MYAPP_UPLOAD_KEY_PASSWORD',
];

function checkUploadKey(ctx, report) {
  report.section('🔑 Play Store upload key');

  const missing = UPLOAD_KEY_VARS.filter((name) => !process.env[name]);
  if (missing.length) {
    report.fail(`Not set: ${missing.join(', ')}`, 'Add them to app/.env (see app/.env.example).');
    return;
  }
  report.pass('MYAPP_UPLOAD_* variables set');

  const storeFile = process.env.MYAPP_UPLOAD_STORE_FILE;
  if (!fs.existsSync(storeFile)) {
    report.fail(`Keystore not found at ${storeFile}`, 'Fix MYAPP_UPLOAD_STORE_FILE in app/.env.');
    return;
  }

  const alias = process.env.MYAPP_UPLOAD_KEY_ALIAS;
  const result = run(jdkTool('keytool'), [
    '-list', '-keystore', storeFile, '-alias', alias, '-storepass:env', 'MYAPP_UPLOAD_STORE_PASSWORD',
  ]);
  const output = outputOf(result);
  if (result.error) {
    report.warn('keytool not found, could not verify the keystore password and alias', `Install JDK ${MIN_JAVA_MAJOR}+ and set JAVA_HOME.`);
  } else if (result.status !== 0) {
    const reason = /password was incorrect|tampered/i.test(output)
      ? 'MYAPP_UPLOAD_STORE_PASSWORD is wrong'
      : /does not exist/i.test(output)
        ? `alias "${alias}" is not in the keystore`
        : output.split('\n')[0];
    report.fail(`Upload keystore check failed: ${reason}`, `Keystore: ${storeFile}`);
  } else {
    report.pass(`Keystore ${storeFile} (alias ${alias})`);
  }
}

function checkDependencies(ctx, report) {
  const { rootDir } = ctx;
  report.section('📦 Dependencies');
  const missing = ['expo', 'react-native'].filter((pkg) => !tryRequire(`${pkg}/package.json`, rootDir));
  if (missing.length) {
    report.warn(`Not installed: ${missing.join(', ')}`, 'npm install runs next and should fix this.');
    return;
  }
  const expoVersion = tryRequire('expo/package.json', rootDir).version;
  const rnVersion = tryRequire('react-native/package.json', rootDir).version;
  report.pass(`expo ${expoVersion}, react-native ${rnVersion}`);
}

/**
 * Cheap checks for everything Gradle would otherwise only discover minutes into the build.
 * Returns { ok, problems, warnings }.
 */
function runPreflight({ rootDir, target }) {
  const androidDir = path.join(rootDir, 'android');
  const ctx = { rootDir, target, androidDir, appDir: path.join(androidDir, 'app') };
  const report = createReporter();

  console.log(`\n${RULE}\n  🔍 PRE-FLIGHT CHECKS (${target.toUpperCase()})\n${RULE}`);

  checkProject(ctx, report);
  checkToolchain(ctx, report);
  if (target === 'aab') checkUploadKey(ctx, report);
  checkDependencies(ctx, report);

  const { problems, warnings } = report;
  const warningNote = warnings.length ? ` (${warnings.length} warning${warnings.length > 1 ? 's' : ''})` : '';
  if (problems.length) {
    console.log(`\n${RULE}\n  ❌ PREFLIGHT FAILED: ${problems.length} problem${problems.length > 1 ? 's' : ''}${warningNote}\n${RULE}`);
    console.log('\nFix the issues above. Gradle build was NOT started.\n');
  } else {
    console.log(`\n${RULE}\n  ✅ PREFLIGHT PASSED${warningNote}\n${RULE}\n`);
  }

  return { ok: problems.length === 0, problems, warnings };
}

module.exports = { runPreflight };

const fs = require('fs');
const path = require('path');
const { parseEnv } = require('util');
const { execSync } = require('child_process');
const { runPreflight } = require('./preflight');

// Usage:
//   node scripts/build-apk.js [release|debug|aab] [--skip-preflight]
//   node scripts/build-apk.js preflight [release|debug|aab]
// `aab` builds a Play Store bundle signed with the MYAPP_UPLOAD_* key from app/.env and bumps the
// app version (patch) and android.versionCode in app.config.ts.
const RELEASE_SERVER_URL = 'wss://battleship-iamrahul25.onrender.com';

const args = process.argv.slice(2);
const positional = args.filter((arg) => !arg.startsWith('--'));
const skipPreflight = args.includes('--skip-preflight');
const checkOnly = positional[0] === 'preflight';
const targetArg = checkOnly ? positional[1] : positional[0];

const target = ['debug', 'aab'].includes(targetArg) ? targetArg : 'release';
const isBundle = target === 'aab';
const gradleTask = { release: 'assembleRelease', debug: 'assembleDebug', aab: 'bundleRelease' }[target];
const artifactFilename = { release: 'app-release.apk', debug: 'app-debug.apk', aab: 'app-release.aab' }[target];
const artifactLabel = isBundle ? 'AAB' : 'APK';
const buildLabel = isBundle ? 'signed Play Store AAB' : `${target.toUpperCase()} APK`;

const rootDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(rootDir, '..');
const androidDir = path.join(rootDir, 'android');
const releaseDir = path.join(repoRoot, 'release');
const appConfigPath = path.join(rootDir, 'app.config.ts');
const outputPath = isBundle
  ? path.join(androidDir, 'app', 'build', 'outputs', 'bundle', 'release', artifactFilename)
  : path.join(androidDir, 'app', 'build', 'outputs', 'apk', target, artifactFilename);
const destPath = path.join(releaseDir, artifactFilename);

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const gradleCmd = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
// Gradle only watches JS/TS under app/ for the bundle task, so edits in
// server/src/shared would otherwise ship a stale bundle.
const gradleArgs = target === 'debug' ? gradleTask : `createBundleReleaseJsAndAssets --rerun ${gradleTask}`;

/** Copies MYAPP_UPLOAD_* from app/.env into process.env (shell values win) so Gradle signs with the upload key. */
function loadUploadKeyEnv() {
  const envFile = path.join(rootDir, '.env');
  if (!fs.existsSync(envFile)) return;
  for (const [key, value] of Object.entries(parseEnv(fs.readFileSync(envFile, 'utf8')))) {
    if (key.startsWith('MYAPP_UPLOAD_') && !process.env[key]) process.env[key] = value;
  }
}

/** Bumps the patch version and android.versionCode in app.config.ts. Returns a function that undoes it. */
function bumpVersion() {
  const original = fs.readFileSync(appConfigPath, 'utf8');
  const versionMatch = original.match(/^(\s*version:\s*['"])(\d+)\.(\d+)\.(\d+)(['"])/m);
  const codeMatch = original.match(/^(\s*versionCode:\s*)(\d+)/m);
  if (!versionMatch || !codeMatch) {
    throw new Error('Could not find version / android.versionCode in app.config.ts');
  }
  const [, , major, minor, patch] = versionMatch;
  const oldVersion = `${major}.${minor}.${patch}`;
  const newVersion = `${major}.${minor}.${Number(patch) + 1}`;
  const oldCode = Number(codeMatch[2]);
  const newCode = oldCode + 1;

  const updated = original
    .replace(versionMatch[0], `${versionMatch[1]}${newVersion}${versionMatch[5]}`)
    .replace(codeMatch[0], `${codeMatch[1]}${newCode}`);
  fs.writeFileSync(appConfigPath, updated);
  console.log(`\n🔼 Version bumped: ${oldVersion} (${oldCode}) → ${newVersion} (${newCode})`);

  return () => {
    fs.writeFileSync(appConfigPath, original);
    console.log(`↩️  Version restored to ${oldVersion} (${oldCode}) because the build failed.`);
  };
}

if (isBundle) {
  loadUploadKeyEnv();
}

console.log(`\n🚀 ${checkOnly ? 'Checking' : 'Starting'} ${buildLabel} build...`);

if (skipPreflight) {
  console.log('\n⚠️  Skipping pre-flight checks (--skip-preflight)');
} else if (!runPreflight({ rootDir, target }).ok) {
  process.exit(1);
}

if (checkOnly) {
  process.exit(0);
}

const env = { ...process.env, EXPO_PUBLIC_SERVER_URL: RELEASE_SERVER_URL };
const restoreVersion = isBundle ? bumpVersion() : null;

try {
  console.log(`🌐 Server URL baked into the ${artifactLabel}: ${RELEASE_SERVER_URL}`);
  console.log('📥 Running npm install...\n');
  execSync(`${npmCmd} install`, { cwd: rootDir, stdio: 'inherit', env });

  if (!fs.existsSync(releaseDir)) {
    fs.mkdirSync(releaseDir, { recursive: true });
  }

  // Syncs app.config.ts (version, versionCode, plugins) into android/.
  console.log('\n🔄 Running expo prebuild (android)...\n');
  execSync(`${npxCmd} expo prebuild --platform android --no-install`, { cwd: rootDir, stdio: 'inherit', env });

  console.log(`\n🛠 Running Gradle ${gradleTask}...\n`);
  const gradleStart = Date.now();
  try {
    execSync(`${gradleCmd} ${gradleArgs}`, { cwd: androidDir, stdio: 'inherit', env });
  } catch (error) {
    console.error(`\n❌ Gradle ${gradleTask} failed (exit code ${error.status ?? 'unknown'}). See the Gradle output above.\n`);
    throw error;
  }
  const gradleMinutes = ((Date.now() - gradleStart) / 60000).toFixed(1);

  if (!fs.existsSync(outputPath)) {
    console.error(`\n❌ Gradle finished but the ${artifactLabel} was not found at ${outputPath}\n`);
    throw new Error('missing build output');
  }

  fs.copyFileSync(outputPath, destPath);
  const sizeMb = (fs.statSync(destPath).size / 1024 / 1024).toFixed(2);
  console.log(`\n✅ Built ${artifactFilename} in ${gradleMinutes} min and saved to release/${artifactFilename} (${sizeMb} MB)\n`);
  if (isBundle) {
    console.log('📦 Signed with the upload key. Upload release/app-release.aab in Play Console.\n');
  }
} catch (error) {
  restoreVersion?.();
  process.exit(error.status || 1);
}

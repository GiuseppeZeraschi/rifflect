#!/usr/bin/env node
/**
 * Build a signed release APK (tasks.md T007, quickstart "Release build and install").
 *   1. expo prebuild --platform android  (regenerates android/, applying plugins/withReleaseSigning.js)
 *   2. gradlew assembleRelease           (fails if the release keystore isn't configured)
 * Output: android/app/build/outputs/apk/release/app-release.apk — install with `npm run install:apk`.
 */
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const isWin = process.platform === 'win32';

function run(cmd, args, cwd) {
  console.log(`\n> ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: isWin });
  if (r.status !== 0) {
    console.error(`\nFailed: ${cmd} ${args.join(' ')} (exit ${r.status})`);
    process.exit(r.status ?? 1);
  }
}

run('npx', ['expo', 'prebuild', '--platform', 'android', '--no-install'], root);
// arm64-v8a only: the Nothing Phone (4a) is 64-bit ARM. Building every ABI made a ~500 MB APK.
// Full path: Windows may be set not to run programs from the current folder (NoDefaultCurrentDirectoryInExePath).
const androidDir = path.join(root, 'android');
run(path.join(androidDir, isWin ? 'gradlew.bat' : 'gradlew'), ['assembleRelease', '-PreactNativeArchitectures=arm64-v8a'], androidDir);
console.log('\nRelease APK: android/app/build/outputs/apk/release/app-release.apk');
console.log('Install it with: npm run install:apk');

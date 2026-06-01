/**
 * build-dist.mjs
 * Windows + macOS 배포 패키지 빌더 (Mac에서 실행)
 *
 * npm run build:win  → youtube-shots-windows.zip
 * npm run build:mac  → youtube-shots-mac.zip
 * npm run build:all  → 둘 다
 *
 * Windows: start.exe (pkg) + 포터블 Node.js (win-x64)
 * Mac    : PhotoReels.app + 포터블 Node.js Universal (arm64 + x64 lipo 합성)
 */

import { execSync, spawnSync } from 'child_process';
import { existsSync, mkdirSync, rmSync, unlinkSync, writeFileSync, chmodSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import fs   from 'fs';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dir, '..');

const NODE_VER = 'v20.13.1';   // Windows / Mac 공통 버전

// ── 플랫폼별 상수 ──────────────────────────────────────────────────────────────
const WIN = {
  ZIP_NAME  : `node-${NODE_VER}-win-x64.zip`,
  ZIP_URL   : `https://nodejs.org/dist/${NODE_VER}/node-${NODE_VER}-win-x64.zip`,
  UNZIP_DIR : `node-${NODE_VER}-win-x64`,
};
const MAC = {
  ARM_TGZ   : `node-${NODE_VER}-darwin-arm64.tar.gz`,
  ARM_URL   : `https://nodejs.org/dist/${NODE_VER}/node-${NODE_VER}-darwin-arm64.tar.gz`,
  ARM_DIR   : `node-${NODE_VER}-darwin-arm64`,
  X64_TGZ   : `node-${NODE_VER}-darwin-x64.tar.gz`,
  X64_URL   : `https://nodejs.org/dist/${NODE_VER}/node-${NODE_VER}-darwin-x64.tar.gz`,
  X64_DIR   : `node-${NODE_VER}-darwin-x64`,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(msg)              { console.log(msg); }
function step(n, total, title) { log(`\n${'─'.repeat(60)}\n[${n}/${total}] ${title}`); }
function sh(cmd, opts = {})    { execSync(cmd, { stdio: 'inherit', ...opts }); }

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const get = (u) => {
      https.get(u, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return get(res.headers.location);
        }
        const total = parseInt(res.headers['content-length'] || '0', 10);
        let done = 0;
        res.on('data', (chunk) => {
          done += chunk.length;
          if (total) {
            const pct = Math.round(done / total * 100);
            const mb  = (done  / 1024 / 1024).toFixed(1);
            const tot = (total / 1024 / 1024).toFixed(1);
            process.stdout.write(`\r      ${pct}%  ${mb} / ${tot} MB   `);
          }
        });
        res.pipe(file);
        file.on('finish', () => { process.stdout.write('\n'); file.close(resolve); });
      }).on('error', (e) => { try { unlinkSync(dest); } catch (_) {} reject(e); });
    };
    get(url);
  });
}

function copyDir(src, dest) {
  if (!existsSync(src)) { log(`      (skip — not found: ${src})`); return; }
  mkdirSync(dest, { recursive: true });
  sh(`cp -r "${src}/." "${dest}/"`);
}

function copyFile(src, dest) {
  if (!existsSync(src)) return;
  mkdirSync(dirname(dest), { recursive: true });
  sh(`cp "${src}" "${dest}"`);
}

/** 공통 소스 파일을 대상 폴더에 복사 (생성 파일 제외) */
function copySourceFiles(targetDir) {
  for (const d of ['app', 'lib', 'remotion', 'scripts', 'types']) {
    copyDir(join(ROOT, d), join(targetDir, d));
  }
  mkdirSync(join(targetDir, 'public'), { recursive: true });
  for (const d of ['fonts', 'bgm']) {
    copyDir(join(ROOT, 'public', d), join(targetDir, 'public', d));
  }
  copyFile(join(ROOT, 'public', 'bgm.wav'), join(targetDir, 'public', 'bgm.wav'));
  for (const f of ['package.json', 'package-lock.json', 'next.config.mjs', 'tsconfig.json', 'next-env.d.ts', 'README.md']) {
    copyFile(join(ROOT, f), join(targetDir, f));
  }
  copyFile(join(ROOT, 'start.bat'), join(targetDir, 'start.bat'));
}

// ── Windows 빌드 ──────────────────────────────────────────────────────────────

async function buildWindows() {
  log('\n' + '='.repeat(60));
  log('  Windows Distribution Builder');
  log('='.repeat(60));

  const RUNTIME    = join(ROOT, 'runtime-win');
  const DIST_EXE   = join(ROOT, 'dist', 'start.exe');
  const DIST_PKG   = join(ROOT, 'dist-win');
  const OUTPUT_ZIP = join(ROOT, 'youtube-shots-windows.zip');

  // 1. Windows 포터블 Node.js
  step(1, 4, 'Portable Node.js for Windows (x64)');
  if (existsSync(join(RUNTIME, 'node.exe'))) {
    log('      Already downloaded. Skipping.');
  } else {
    const zipPath = join(ROOT, WIN.ZIP_NAME);
    log(`      URL: ${WIN.ZIP_URL}`);
    await download(WIN.ZIP_URL, zipPath);
    log('      Extracting...');
    sh(`unzip -q -o "${zipPath}" -d "${ROOT}"`);
    if (existsSync(RUNTIME)) rmSync(RUNTIME, { recursive: true, force: true });
    sh(`mv "${join(ROOT, WIN.UNZIP_DIR)}" "${RUNTIME}"`);
    unlinkSync(zipPath);
    log(`      Saved → runtime-win/`);
  }

  // 2. start.exe 빌드
  step(2, 4, 'Build start.exe  (pkg@5.8.1 / node18-win-x64)');
  mkdirSync(join(ROOT, 'dist'), { recursive: true });
  sh(
    'npx pkg@5.8.1 scripts/launcher.cjs --target node18-win-x64 --output dist/start.exe',
    { cwd: ROOT }
  );
  log(`      Created: ${DIST_EXE}`);

  // 3. 배포 폴더 조립
  step(3, 4, 'Assemble distribution folder');
  if (existsSync(DIST_PKG)) rmSync(DIST_PKG, { recursive: true, force: true });
  mkdirSync(DIST_PKG, { recursive: true });

  sh(`cp "${DIST_EXE}" "${join(DIST_PKG, 'start.exe')}"`);
  copyDir(RUNTIME, join(DIST_PKG, 'runtime'));
  copySourceFiles(DIST_PKG);
  log('      Assembled!');

  // 4. ZIP 생성
  step(4, 4, 'Create zip → youtube-shots-windows.zip');
  if (existsSync(OUTPUT_ZIP)) unlinkSync(OUTPUT_ZIP);
  sh(`cd "${DIST_PKG}" && zip -r "${OUTPUT_ZIP}" . -x "*.DS_Store" -x "__MACOSX/*"`);

  const size = spawnSync('du', ['-sh', OUTPUT_ZIP]).stdout?.toString().split('\t')[0]?.trim() ?? '?';
  printSummary('Windows', 'youtube-shots-windows.zip', size, [
    '1. zip 압축 해제',
    '2. start.exe 더블클릭',
    '3. 첫 실행 시 자동 설치 → 브라우저 열림',
  ]);
}

// ── macOS 빌드 ────────────────────────────────────────────────────────────────

async function buildMac() {
  log('\n' + '='.repeat(60));
  log('  macOS Distribution Builder  (Universal binary)');
  log('='.repeat(60));

  const RUNTIME    = join(ROOT, 'runtime-mac');  // Universal node 저장 위치
  const DIST_PKG   = join(ROOT, 'dist-mac');
  const OUTPUT_ZIP = join(ROOT, 'youtube-shots-mac.zip');
  const APP_NAME   = 'PhotoReels.app';
  const APP_DIR    = join(DIST_PKG, APP_NAME);

  // 1. arm64 Node.js 다운로드
  step(1, 6, 'Download Node.js darwin-arm64  (Apple Silicon)');
  const armExtract = join(ROOT, '_node-arm64');
  if (existsSync(join(armExtract, 'bin', 'node'))) {
    log('      Already downloaded. Skipping.');
  } else {
    const tgz = join(ROOT, MAC.ARM_TGZ);
    log(`      URL: ${MAC.ARM_URL}`);
    await download(MAC.ARM_URL, tgz);
    log('      Extracting...');
    if (existsSync(armExtract)) rmSync(armExtract, { recursive: true, force: true });
    mkdirSync(armExtract, { recursive: true });
    sh(`tar -xzf "${tgz}" -C "${armExtract}" --strip-components=1`);
    unlinkSync(tgz);
    log('      Done.');
  }

  // 2. x64 Node.js 다운로드
  step(2, 6, 'Download Node.js darwin-x64  (Intel)');
  const x64Extract = join(ROOT, '_node-x64');
  if (existsSync(join(x64Extract, 'bin', 'node'))) {
    log('      Already downloaded. Skipping.');
  } else {
    const tgz = join(ROOT, MAC.X64_TGZ);
    log(`      URL: ${MAC.X64_URL}`);
    await download(MAC.X64_URL, tgz);
    log('      Extracting...');
    if (existsSync(x64Extract)) rmSync(x64Extract, { recursive: true, force: true });
    mkdirSync(x64Extract, { recursive: true });
    sh(`tar -xzf "${tgz}" -C "${x64Extract}" --strip-components=1`);
    unlinkSync(tgz);
    log('      Done.');
  }

  // 3. Universal 바이너리 합성 (lipo)
  step(3, 6, 'Create Universal binary  (lipo arm64 + x64)');
  if (existsSync(join(RUNTIME, 'bin', 'node'))) {
    log('      Already created. Skipping.');
  } else {
    if (existsSync(RUNTIME)) rmSync(RUNTIME, { recursive: true, force: true });

    // arm64 기반으로 전체 구조 복사 (npm, npx 등 스크립트는 아키텍처 무관)
    sh(`cp -r "${armExtract}/." "${RUNTIME}/"`);

    // node 바이너리만 Universal로 교체
    sh([
      'lipo -create',
      `"${join(armExtract, 'bin', 'node')}"`,
      `"${join(x64Extract, 'bin', 'node')}"`,
      `-output "${join(RUNTIME, 'bin', 'node')}"`,
    ].join(' '));
    chmodSync(join(RUNTIME, 'bin', 'node'), 0o755);

    // 검증
    const archs = spawnSync('lipo', ['-archs', join(RUNTIME, 'bin', 'node')]).stdout?.toString().trim();
    log(`      Universal binary archs: ${archs}`);
    log(`      Saved → runtime-mac/`);
  }

  // 4. .app 번들 구조 생성
  step(4, 6, 'Create PhotoReels.app bundle');
  if (existsSync(DIST_PKG)) rmSync(DIST_PKG, { recursive: true, force: true });

  const MACOS_DIR     = join(APP_DIR, 'Contents', 'MacOS');
  const LAUNCHER_PATH = join(MACOS_DIR, 'PhotoReels');
  const PLIST_PATH    = join(APP_DIR, 'Contents', 'Info.plist');

  mkdirSync(MACOS_DIR,  { recursive: true });
  mkdirSync(join(APP_DIR, 'Contents', 'Resources'), { recursive: true });

  // Info.plist
  writeFileSync(PLIST_PATH, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>PhotoReels</string>
  <key>CFBundleDisplayName</key>
  <string>C-Type Photo Reels Generator</string>
  <key>CFBundleIdentifier</key>
  <string>com.photoreels.app</string>
  <key>CFBundleVersion</key>
  <string>1.0.0</string>
  <key>CFBundleExecutable</key>
  <string>PhotoReels</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>LSMinimumSystemVersion</key>
  <string>11.0</string>
  <key>LSUIElement</key>
  <false/>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
`);

  // 런처 셸 스크립트 (.app/Contents/MacOS/PhotoReels)
  writeFileSync(LAUNCHER_PATH, `#!/bin/bash
# PhotoReels.app launcher
# .app/Contents/MacOS/ 에서 실행 → 3단계 위가 배포 루트

APP_MACOS_DIR="$(cd "$(dirname "$0")" && pwd)"
DIST_ROOT="$(cd "$APP_MACOS_DIR/../../.." && pwd)"
LAUNCHER="$DIST_ROOT/scripts/launcher-mac.sh"

if [ ! -f "$LAUNCHER" ]; then
  osascript -e 'display alert "Files Missing" message "scripts/launcher-mac.sh not found.\\nPlease re-download the package." as critical'
  exit 1
fi

chmod +x "$LAUNCHER" 2>/dev/null || true

# Terminal 창을 열어 런처 실행
osascript <<APPLESCRIPT
tell application "Terminal"
  activate
  set win to do script "clear; \\"$LAUNCHER\\""
  set custom title of win to "C-Type Photo Reels Generator"
end tell
APPLESCRIPT
`);
  chmodSync(LAUNCHER_PATH, 0o755);
  log(`      Created: ${APP_DIR}`);

  // 5. 소스 파일 + runtime 배치
  step(5, 6, 'Copy source files & Universal runtime');
  copySourceFiles(DIST_PKG);
  copyDir(RUNTIME, join(DIST_PKG, 'runtime'));
  log('      Assembled!');

  // 6. ZIP 생성
  step(6, 6, 'Create zip → youtube-shots-mac.zip');
  if (existsSync(OUTPUT_ZIP)) unlinkSync(OUTPUT_ZIP);
  sh(`cd "${DIST_PKG}" && zip -r "${OUTPUT_ZIP}" . -x "*.DS_Store" -x "__MACOSX/*"`);

  const size = spawnSync('du', ['-sh', OUTPUT_ZIP]).stdout?.toString().split('\t')[0]?.trim() ?? '?';
  printSummary('macOS', 'youtube-shots-mac.zip', size, [
    '1. zip 압축 해제',
    '2. PhotoReels.app 더블클릭',
    '   (처음엔 우클릭 → 열기 필요 — Gatekeeper 우회)',
    '3. Terminal 창이 열리고 자동 설치 → 브라우저 열림',
  ]);
}

// ── 결과 출력 ─────────────────────────────────────────────────────────────────

function printSummary(platform, zipName, size, steps) {
  log('\n' + '='.repeat(60));
  log(`  Build Complete! [${platform}]`);
  log('='.repeat(60));
  log(`  Output : ${zipName}`);
  log(`  Size   : ${size}`);
  log('');
  log(`  사용법:`);
  steps.forEach(s => log(`    ${s}`));
  log('='.repeat(60) + '\n');
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  const mode = process.argv[2] ?? 'win';  // win | mac | all

  if (mode === 'win' || mode === 'all') await buildWindows();
  if (mode === 'mac' || mode === 'all') await buildMac();

  if (!['win', 'mac', 'all'].includes(mode)) {
    console.error('Usage: node scripts/build-dist.mjs [win|mac|all]');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('\n[ERROR]', e.message);
  process.exit(1);
});

/**
 * build-installers.mjs
 * 기존 dist-win / dist-mac 를 "진짜 설치파일"로 포장한다.
 *
 *   node scripts/build-installers.mjs win   → YouTubeShots-Setup-<ver>.exe  (NSIS)
 *   node scripts/build-installers.mjs mac   → YouTubeShots-<ver>-arm64.dmg  (자체포함 .app)
 *   node scripts/build-installers.mjs all
 *
 * Windows: dist-win 전체를 %LOCALAPPDATA%\YouTubeShots 에 설치(관리자 불필요) +
 *          시작메뉴/바탕화면 바로가기 + 언인스톨러 등록.
 * macOS  : 페이로드(runtime+소스)를 .app 안(Contents/Resources)에 넣고,
 *          첫 실행 시 ~/Library/Application Support/PhotoReels 로 복사 후 구동.
 *          → dmg 로 .app 하나만 드래그 설치해도 동작한다.
 */
import { execSync } from 'child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync, chmodSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..');
const OUT = join(ROOT, 'dist-installers');

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const VERSION = pkg.version || '1.0.0';
const APP_NAME = 'YouTubeShots';
const APP_DISPLAY = 'C-Type Photo Reels Generator';
const PUBLISHER = 'YouTube Shots Creator';

const NODE_VER = 'v20.13.1';   // 번들 Node 버전 (build-dist.mjs 와 동일)

const sh = (cmd, opts = {}) => { console.log('».', cmd); execSync(cmd, { stdio: 'inherit', ...opts }); };
const shOK = (cmd, opts = {}) => { console.log('».', cmd); try { execSync(cmd, { stdio: 'inherit', ...opts }); } catch (_) {} };

/**
 * 깨끗한 arm64 Node 런타임을 dest 에 설치한다.
 * tar 로 직접 추출하므로 bin/npm→lib/node_modules/npm 심볼릭 링크와 npm 트리가 온전.
 * (기존 cp -r 복사본은 이 부분이 유실돼 `Cannot find module '../lib/cli.js'` 발생)
 */
function installCleanNode(dest) {
  const dir = `node-${NODE_VER}-darwin-arm64`;
  const tgz = join(ROOT, `.${dir}.tar.gz`);
  const tmp = join(ROOT, `.${dir}`);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  if (!existsSync(tgz)) {
    sh(`curl -L -o "${tgz}" "https://nodejs.org/dist/${NODE_VER}/${dir}.tar.gz"`);
  }
  sh(`tar -xzf "${tgz}" -C "${tmp}" --strip-components=1`);
  rmSync(dest, { recursive: true, force: true });
  sh(`mv "${tmp}" "${dest}"`);
  // 검증: npm 실체 파일이 있어야 함
  const npmCli = join(dest, 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (!existsSync(npmCli)) throw new Error('번들 Node 에 npm 이 없습니다: ' + npmCli);
}

// ────────────────────────────────────────────────────────────── Windows (NSIS)
function buildWindows() {
  const DIST = join(ROOT, 'dist-win');
  if (!existsSync(join(DIST, 'start.exe'))) {
    throw new Error('dist-win 이 없습니다. 먼저 `npm run build:win` 을 실행하세요.');
  }
  if (!which('makensis')) {
    throw new Error('makensis(NSIS)가 없습니다.  brew install nsis');
  }
  mkdirSync(OUT, { recursive: true });

  // start.exe(pkg 바이너리)는 백신 오탐/파일잠금 문제가 잦다. 이를 빼고
  // 번들 node 로 launcher.cjs 를 실행하는 start.bat 로 대체한다.
  const stage = join(ROOT, '.win-stage');
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });
  sh(`rsync -a --exclude 'start.exe' "${DIST}/" "${stage}/"`);
  writeFileSync(join(stage, 'start.bat'), winStartBat(), 'utf8');

  const nsi = join(ROOT, 'installer.nsi');
  writeFileSync(nsi, nsisScript(stage), 'utf8');
  sh(`makensis "${nsi}"`, { cwd: ROOT });
  rmSync(stage, { recursive: true, force: true });

  const exe = join(OUT, `${APP_NAME}-Setup-${VERSION}.exe`);
  if (!existsSync(exe)) throw new Error('Setup.exe 생성 실패');
  rmSync(nsi, { force: true });
  console.log(`\n✅ Windows 설치파일: ${exe}`);
}

// start.exe(pkg) 대체용 배치 런처: 번들 node 로 launcher.cjs 직접 실행.
function winStartBat() {
  return [
    '@echo off',
    'chcp 65001 >nul 2>&1',
    'title C-Type Photo Reels Generator',
    'cd /d "%~dp0"',
    '"%~dp0runtime\\node.exe" "%~dp0scripts\\launcher.cjs"',
    '',
  ].join('\r\n');
}

function nsisScript(srcDir) {
  // NSIS는 host 소스 경로에 '/' 를 허용(makensis on mac). 설치경로는 '\\' 사용.
  return `!include "MUI2.nsh"

Name "${APP_DISPLAY}"
OutFile "${OUT}/${APP_NAME}-Setup-${VERSION}.exe"
Unicode true
RequestExecutionLevel user
InstallDir "$LOCALAPPDATA\\${APP_NAME}"
ShowInstDetails show
ShowUninstDetails show

!define REGKEY "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${APP_NAME}"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Korean"
!insertmacro MUI_LANGUAGE "English"

Section "Install"
  SetOutPath "$INSTDIR"
  File /r "${srcDir}/*"

  CreateDirectory "$SMPROGRAMS\\${APP_DISPLAY}"
  CreateShortcut "$SMPROGRAMS\\${APP_DISPLAY}\\${APP_DISPLAY}.lnk" "$INSTDIR\\start.bat" "" "$INSTDIR\\runtime\\node.exe"
  CreateShortcut "$DESKTOP\\${APP_DISPLAY}.lnk" "$INSTDIR\\start.bat" "" "$INSTDIR\\runtime\\node.exe"

  WriteUninstaller "$INSTDIR\\uninstall.exe"
  WriteRegStr HKCU "\${REGKEY}" "DisplayName" "${APP_DISPLAY}"
  WriteRegStr HKCU "\${REGKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "\${REGKEY}" "Publisher" "${PUBLISHER}"
  WriteRegStr HKCU "\${REGKEY}" "DisplayIcon" "$INSTDIR\\runtime\\node.exe"
  WriteRegStr HKCU "\${REGKEY}" "UninstallString" "$INSTDIR\\uninstall.exe"
  WriteRegStr HKCU "\${REGKEY}" "InstallLocation" "$INSTDIR"
  WriteRegDWORD HKCU "\${REGKEY}" "NoModify" 1
  WriteRegDWORD HKCU "\${REGKEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  Delete "$SMPROGRAMS\\${APP_DISPLAY}\\${APP_DISPLAY}.lnk"
  RMDir  "$SMPROGRAMS\\${APP_DISPLAY}"
  Delete "$DESKTOP\\${APP_DISPLAY}.lnk"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "\${REGKEY}"
SectionEnd
`;
}

// ────────────────────────────────────────────────────────────────── macOS (dmg)
function buildMac() {
  const DIST_MAC = join(ROOT, 'dist-mac');
  if (!existsSync(join(DIST_MAC, 'runtime', 'bin', 'node'))) {
    throw new Error('dist-mac 이 없습니다. 먼저 `npm run build:mac` 을 실행하세요.');
  }
  mkdirSync(OUT, { recursive: true });

  const stage = join(ROOT, '.dmg-stage');
  if (existsSync(stage)) rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });

  const APP = join(stage, 'PhotoReels.app');
  const MACOS = join(APP, 'Contents', 'MacOS');
  const RES = join(APP, 'Contents', 'Resources');
  const PAYLOAD = join(RES, 'payload');
  mkdirSync(MACOS, { recursive: true });
  mkdirSync(PAYLOAD, { recursive: true });

  // 페이로드 = dist-mac 소스만. runtime 은 아래에서 "깨끗한" node 로 새로 넣는다.
  // (기존 build-dist 의 cp 복사본은 lib/node_modules/npm 이 유실돼 npm 이 깨짐)
  sh(`rsync -a --exclude 'PhotoReels.app' --exclude 'runtime' "${DIST_MAC}/" "${PAYLOAD}/"`);

  // 깨끗한 arm64 Node 런타임을 tar 로 직접 추출 → 심볼릭 링크와 npm 트리 온전히 보존
  installCleanNode(join(PAYLOAD, 'runtime'));

  // Info.plist
  writeFileSync(join(APP, 'Contents', 'Info.plist'), infoPlist(), 'utf8');

  // 자체포함 런처: payload → Application Support 로 복사 후 기존 launcher-mac.sh 구동
  const launcher = join(MACOS, 'PhotoReels');
  writeFileSync(launcher, appLauncher(), 'utf8');
  chmodSync(launcher, 0o755);

  // create-dmg (실패해도 결과 파일로 판정)
  const dmg = join(OUT, `${APP_NAME}-${VERSION}-arm64.dmg`);
  if (existsSync(dmg)) rmSync(dmg, { force: true });
  shOK([
    'create-dmg',
    '--volname', `"${APP_DISPLAY}"`,
    '--app-drop-link', '450', '180',
    '--icon', '"PhotoReels.app"', '150', '180',
    '--window-size', '600', '360',
    '--no-internet-enable',
    `"${dmg}"`, `"${APP}"`,
  ].join(' '), { cwd: ROOT });

  if (!existsSync(dmg)) {
    // 폴백: hdiutil
    const st2 = join(ROOT, '.dmg-stage2');
    if (existsSync(st2)) rmSync(st2, { recursive: true, force: true });
    mkdirSync(st2);
    sh(`cp -R "${APP}" "${st2}/"`);
    sh(`ln -s /Applications "${st2}/Applications"`);
    sh(`hdiutil create -volname "${APP_DISPLAY}" -srcfolder "${st2}" -ov -format UDZO "${dmg}"`);
    rmSync(st2, { recursive: true, force: true });
  }
  rmSync(stage, { recursive: true, force: true });
  if (!existsSync(dmg)) throw new Error('dmg 생성 실패');
  console.log(`\n✅ macOS 설치파일(무서명): ${dmg}`);
}

function infoPlist() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>PhotoReels</string>
  <key>CFBundleDisplayName</key><string>${APP_DISPLAY}</string>
  <key>CFBundleIdentifier</key><string>com.photoreels.app</string>
  <key>CFBundleVersion</key><string>${VERSION}</string>
  <key>CFBundleShortVersionString</key><string>${VERSION}</string>
  <key>CFBundleExecutable</key><string>PhotoReels</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
`;
}

function appLauncher() {
  // .app 안에서 실행. payload 를 쓰기 가능한 위치로 복사한 뒤 Terminal 로 런처 구동.
  return `#!/bin/bash
set -e
APP_RES="$(cd "$(dirname "$0")/../Resources" && pwd)"
PAYLOAD="$APP_RES/payload"
WORK="$HOME/Library/Application Support/PhotoReels"

mkdir -p "$WORK"
# 소스/런타임 동기화 (사용자가 설치한 node_modules/.next 는 보존)
rsync -a --delete \\
  --exclude 'node_modules' --exclude '.next' \\
  "$PAYLOAD/" "$WORK/"

# dmg 다운로드 격리 속성 제거 → node 실행 차단 방지
xattr -dr com.apple.quarantine "$WORK" 2>/dev/null || true
chmod +x "$WORK/scripts/launcher-mac.sh" "$WORK/runtime/bin/node" "$WORK/runtime/bin/npm" 2>/dev/null || true

osascript <<APPLESCRIPT
tell application "Terminal"
  activate
  set win to do script "clear; \\"$WORK/scripts/launcher-mac.sh\\""
  set custom title of win to "${APP_DISPLAY}"
end tell
APPLESCRIPT
`;
}

// ──────────────────────────────────────────────────────────────────── helpers
function which(bin) {
  try { execSync(`command -v ${bin}`, { stdio: 'ignore' }); return true; } catch { return false; }
}

// ────────────────────────────────────────────────────────────────────── entry
const mode = process.argv[2] ?? 'all';
if (mode === 'win' || mode === 'all') buildWindows();
if (mode === 'mac' || mode === 'all') buildMac();
if (!['win', 'mac', 'all'].includes(mode)) {
  console.error('Usage: node scripts/build-installers.mjs [win|mac|all]');
  process.exit(1);
}

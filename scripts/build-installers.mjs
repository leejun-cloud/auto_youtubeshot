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

const sh = (cmd, opts = {}) => { console.log('».', cmd); execSync(cmd, { stdio: 'inherit', ...opts }); };
const shOK = (cmd, opts = {}) => { console.log('».', cmd); try { execSync(cmd, { stdio: 'inherit', ...opts }); } catch (_) {} };

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

  const nsi = join(ROOT, 'installer.nsi');
  writeFileSync(nsi, nsisScript(DIST), 'utf8');
  sh(`makensis "${nsi}"`, { cwd: ROOT });

  const exe = join(OUT, `${APP_NAME}-Setup-${VERSION}.exe`);
  if (!existsSync(exe)) throw new Error('Setup.exe 생성 실패');
  rmSync(nsi, { force: true });
  console.log(`\n✅ Windows 설치파일: ${exe}`);
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
  CreateShortcut "$SMPROGRAMS\\${APP_DISPLAY}\\${APP_DISPLAY}.lnk" "$INSTDIR\\start.exe"
  CreateShortcut "$DESKTOP\\${APP_DISPLAY}.lnk" "$INSTDIR\\start.exe"

  WriteUninstaller "$INSTDIR\\uninstall.exe"
  WriteRegStr HKCU "\${REGKEY}" "DisplayName" "${APP_DISPLAY}"
  WriteRegStr HKCU "\${REGKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "\${REGKEY}" "Publisher" "${PUBLISHER}"
  WriteRegStr HKCU "\${REGKEY}" "DisplayIcon" "$INSTDIR\\start.exe"
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

  // 페이로드 = dist-mac 내용에서 기존 (비자체포함) PhotoReels.app 만 제외
  sh(`rsync -a --exclude 'PhotoReels.app' "${DIST_MAC}/" "${PAYLOAD}/"`);

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

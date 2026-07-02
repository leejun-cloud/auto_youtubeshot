/**
 * 설치(첫 실행) 시점 사전 준비 스크립트 — 렌더 시점 다운로드/타임아웃 방지.
 *  - 시스템 Chrome/Edge가 있으면 다운로드 없이 통과
 *  - 없으면 Remotion Chrome Headless Shell을 지금 다운로드 (진행률 표시)
 *  실행: node scripts/warmup.mjs   (launcher의 install 단계 직후 호출)
 */
import fs from 'fs';
import path from 'path';
import { ensureBrowser } from '@remotion/renderer';

const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };

const systemBrowser = () => {
  const env = process.env.REMOTION_BROWSER_EXECUTABLE;
  if (env && exists(env)) return env;
  const home = process.env.HOME || '';
  const pf = process.env['ProgramFiles'] || 'C:\\Program Files';
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const local = process.env['LOCALAPPDATA'] || '';
  const list = process.platform === 'win32' ? [
    path.join(pf, 'Google/Chrome/Application/chrome.exe'),
    path.join(pf86, 'Google/Chrome/Application/chrome.exe'),
    local && path.join(local, 'Google/Chrome/Application/chrome.exe'),
    path.join(pf, 'Microsoft/Edge/Application/msedge.exe'),
    path.join(pf86, 'Microsoft/Edge/Application/msedge.exe'),
  ] : process.platform === 'darwin' ? [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    `${home}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`,
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ] : ['/usr/bin/google-chrome', '/usr/bin/chromium'];
  return list.filter(Boolean).find(exists) || null;
};

const main = async () => {
  console.log('[warmup] 렌더링용 브라우저 점검 중...');
  const sys = systemBrowser();
  if (sys) {
    console.log(`[warmup] ✅ 시스템 브라우저 발견 — 다운로드 생략: ${sys}`);
    return;
  }
  console.log('[warmup] 시스템 Chrome/Edge 없음 → Chrome Headless Shell 다운로드 (최초 1회, ~150MB)');
  let last = -1;
  await ensureBrowser({
    onBrowserDownload: () => ({
      version: null,
      onProgress: ({ percent }) => {
        const p = Math.round(percent * 100);
        if (p !== last && p % 5 === 0) { last = p; console.log(`[warmup] 다운로드 ${p}%`); }
      },
    }),
  });
  console.log('[warmup] ✅ 헤드리스 브라우저 준비 완료');
};

main().catch((e) => {
  console.error('[warmup] ❌ 브라우저 준비 실패:', e?.message || e);
  console.error('[warmup] 해결: Chrome을 설치하거나, 네트워크(방화벽/프록시) 확인 후 앱을 다시 실행하세요.');
  process.exit(1);
});

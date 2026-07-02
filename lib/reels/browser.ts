import fs from 'fs';
import path from 'path';
import { ensureBrowser } from '@remotion/renderer';

/**
 * 헤드리스 브라우저 확보 전략 (v1.0.11 — "Timed out while setting up the headless browser" 근본 해결)
 *
 * 우선순위:
 *  1. REMOTION_BROWSER_EXECUTABLE 환경변수 (수동 지정)
 *  2. 이미 설치된 시스템 Chrome / Edge (다운로드 불필요 → 즉시 렌더)
 *  3. Remotion 자체 Chrome Headless Shell (없으면 이때 다운로드, 진행 로그 출력)
 *
 * 기존 문제: renderMedia()가 렌더 시점에 몰래 ~150MB 브라우저를 다운로드
 * → 느린 네트워크/방화벽에서 10분 타임아웃. 이제 시스템 브라우저를 먼저 쓰고,
 * 다운로드가 필요하면 명확한 로그와 함께 사전 준비 단계(warmup)에서 수행한다.
 */

const winCandidates = () => {
  const pf = process.env['ProgramFiles'] || 'C:\\Program Files';
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const local = process.env['LOCALAPPDATA'] || '';
  return [
    path.join(pf, 'Google/Chrome/Application/chrome.exe'),
    path.join(pf86, 'Google/Chrome/Application/chrome.exe'),
    local && path.join(local, 'Google/Chrome/Application/chrome.exe'),
    path.join(pf, 'Microsoft/Edge/Application/msedge.exe'),
    path.join(pf86, 'Microsoft/Edge/Application/msedge.exe'),
  ].filter(Boolean) as string[];
};

const macCandidates = () => [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  `${process.env.HOME}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`,
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
];

const linuxCandidates = () => [
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
];

export const findSystemBrowser = (): string | null => {
  const env = process.env.REMOTION_BROWSER_EXECUTABLE;
  if (env && fs.existsSync(env)) return env;

  const candidates =
    process.platform === 'win32' ? winCandidates()
    : process.platform === 'darwin' ? macCandidates()
    : linuxCandidates();

  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c; } catch { /* ignore */ }
  }
  return null;
};

let resolved: string | null | undefined; // undefined = 아직 확인 전

/**
 * 렌더에 사용할 브라우저 실행 파일 경로를 반환.
 * 시스템 브라우저가 없으면 Remotion 헤드리스 셸을 확보(필요 시 다운로드)하고
 * null을 반환한다(null이면 renderMedia가 확보된 셸을 자동 사용).
 */
export const resolveBrowserExecutable = async (): Promise<string | null> => {
  if (resolved !== undefined) return resolved;

  const sys = findSystemBrowser();
  if (sys) {
    console.log(`[browser] 시스템 브라우저 사용: ${sys}`);
    resolved = sys;
    return resolved;
  }

  console.log('[browser] 시스템 Chrome/Edge를 찾지 못했습니다. Remotion 헤드리스 브라우저를 확보합니다...');
  await ensureBrowser({
    onBrowserDownload: () => {
      console.log('[browser] Chrome Headless Shell 다운로드 시작 (~150MB, 최초 1회)...');
      return {
        version: null,
        onProgress: ({ percent }: { percent: number }) => {
          const p = Math.round(percent * 100);
          if (p % 10 === 0) console.log(`[browser] 다운로드 ${p}%`);
        },
      };
    },
  });
  console.log('[browser] 헤드리스 브라우저 준비 완료.');
  resolved = null;
  return resolved;
};

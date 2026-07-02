import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { mkdir } from 'fs/promises';
import path from 'path';
import { getFfmpegPath, getFfprobePath } from './ffmpeg-binaries';
import { resolveBrowserExecutable } from './browser';

// Configure Remotion to use ffmpeg-static and ffprobe-static
process.env.REMOTION_FFMPEG_PATH = getFfmpegPath();
process.env.REMOTION_FFPROBE_PATH = getFfprobePath();

export type ReelsTemplate = 'photo';

export const COMPOSITION_MAP: Record<ReelsTemplate, string> = {
  photo: 'PhotoReel',
};

const PUBLIC_DIR = path.join(process.cwd(), 'public');

let cachedServeUrl: string | null = null;

export const getRemotionBundle = async (forceRefresh = false): Promise<string> => {
  if (cachedServeUrl && !forceRefresh) return cachedServeUrl;

  const entryPoint = path.join(process.cwd(), 'remotion', 'index.ts');

  cachedServeUrl = await bundle({
    entryPoint,
    webpackOverride: (config) => config,
    publicDir: PUBLIC_DIR,
  });
  return cachedServeUrl;
};

const ASSET_TIMEOUT_MS = 120_000; // 2 minutes
const TOTAL_TIMEOUT_MS = 600_000; // 10 minutes

const baseRenderOptions = {
  timeoutInMilliseconds: TOTAL_TIMEOUT_MS,
  delayRenderTimeoutInMilliseconds: ASSET_TIMEOUT_MS,
  logLevel: 'info' as const,
  onBrowserLog: (log: { type: string; text: string }) => {
    if (log.type === 'error' || log.type === 'warning') {
      console.warn(`[chromium ${log.type}]`, log.text);
    }
  },
};

export interface RenderOptions {
  template: ReelsTemplate;
  data: Record<string, unknown>;
  outputFileName?: string;
  forceRebundle?: boolean;
  onProgress?: (progress: number) => void;
}

export interface RenderResult {
  localPath: string;
  fileName: string;
  publicUrl: string;
}

export const renderReel = async (options: RenderOptions): Promise<RenderResult> => {
  const { template, data, onProgress } = options;
  const compositionId = COMPOSITION_MAP[template];
  if (!compositionId) {
    throw new Error(`지원하지 않는 템플릿: ${template}`);
  }

  const outDir = path.join(process.cwd(), 'public', 'reels');
  await mkdir(outDir, { recursive: true });
  const fileName = options.outputFileName || `reel-${template}-${Date.now()}.mp4`;
  const localPath = path.join(outDir, fileName);

  // ★ 렌더 전에 브라우저를 명시적으로 확보 (시스템 Chrome/Edge 우선, 없으면 다운로드).
  //   기존에는 renderMedia 내부에서 몰래 다운로드하다 10분 타임아웃으로 죽었음.
  let browserExecutable: string | null;
  try {
    browserExecutable = await resolveBrowserExecutable();
  } catch (e) {
    throw new Error(
      '렌더링용 브라우저 준비 실패: ' + (e instanceof Error ? e.message : String(e)) +
      '\n해결 방법: (1) Chrome 브라우저를 설치하거나 (2) 인터넷/방화벽 상태를 확인한 뒤 다시 시도하세요.'
    );
  }

  const serveUrl = await getRemotionBundle(options.forceRebundle ?? false);

  const composition = await selectComposition({
    serveUrl,
    id: compositionId,
    inputProps: data,
    chromiumOptions: {},
    browserExecutable,
    timeoutInMilliseconds: TOTAL_TIMEOUT_MS,
  });

  await renderMedia({
    serveUrl,
    composition,
    codec: 'h264',
    outputLocation: localPath,
    inputProps: data,
    browserExecutable,
    ...baseRenderOptions,
    onProgress: onProgress
      ? ({ progress }) => {
          try {
            onProgress(progress);
          } catch {
            // ignore
          }
        }
      : undefined,
  });

  return {
    localPath,
    fileName,
    publicUrl: `/reels/${fileName}`,
  };
};

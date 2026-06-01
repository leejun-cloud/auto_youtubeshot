import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { mkdir } from 'fs/promises';
import path from 'path';
import { getFfmpegPath, getFfprobePath } from './ffmpeg-binaries';

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
  
  // Verify or download browser if needed (Remotion does this automatically, but let's make sure entryPoint exists)
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

  const serveUrl = await getRemotionBundle(options.forceRebundle ?? false);

  const composition = await selectComposition({
    serveUrl,
    id: compositionId,
    inputProps: data,
    chromiumOptions: {},
  });

  await renderMedia({
    serveUrl,
    composition,
    codec: 'h264',
    outputLocation: localPath,
    inputProps: data,
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

// ffmpeg helpers for slide-by-slide rendering pipeline.
import { spawn } from 'child_process';
import { writeFile, mkdir, stat } from 'fs/promises';
import path from 'path';
import { createHash, randomUUID } from 'crypto';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { getFfmpegPath, getFfprobePath } from './ffmpeg-binaries';

const run = (args: string[], onLog?: (line: string) => void): Promise<void> =>
  new Promise((resolve, reject) => {
    const p = spawn(getFfmpegPath(), args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    p.stderr.on('data', (b) => {
      const s = b.toString();
      stderr += s;
      if (onLog) for (const line of s.split('\n')) if (line.trim()) onLog(line);
    });
    p.on('error', reject);
    p.on('close', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`ffmpeg exited ${code}: ${stderr.split('\n').slice(-20).join('\n')}`))
    );
  });

/**
 * Concat multiple MP4 slices (same codec/resolution) into one MP4.
 * Uses the concat demuxer which is fast and lossless.
 */
export const concatVideos = async (
  inputPaths: string[],
  outputPath: string,
  onLog?: (s: string) => void
): Promise<void> => {
  if (inputPaths.length === 0) throw new Error('concatVideos: no inputs');
  if (inputPaths.length === 1) {
    // single slice — just copy
    await run(['-y', '-i', inputPaths[0], '-c', 'copy', outputPath], onLog);
    return;
  }
  const listPath = `${outputPath}.concat.txt`;
  const body = inputPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
  await writeFile(listPath, body, 'utf-8');
  await run(
    ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', outputPath],
    onLog
  );
};

/**
 * Mux narration + BGM onto a silent video. Either audio path may be undefined.
 * BGM is mixed at `bgmVolume` (linear 0..1). Output uses AAC audio, H.264 video copy.
 */
export const muxAudio = async (
  videoPath: string,
  audioPath: string | undefined,
  bgmPath: string | undefined,
  bgmVolume: number,
  outputPath: string,
  onLog?: (s: string) => void
): Promise<void> => {
  const videoDurationSec = await probeDurationSec(videoPath);

  if (!audioPath && !bgmPath) {
    await run(['-y', '-i', videoPath, '-c', 'copy', outputPath], onLog);
    return;
  }

  const args: string[] = ['-y', '-i', videoPath];
  if (audioPath) args.push('-i', audioPath);
  if (bgmPath) {
    if (videoDurationSec) args.push('-stream_loop', '-1');
    args.push('-i', bgmPath);
  }

  const durationFilter = (chain: string) =>
    videoDurationSec
      ? `${chain},atrim=0:${videoDurationSec.toFixed(3)},asetpts=N/SR/TB`
      : chain;
  const outputDurationArgs = videoDurationSec ? ['-t', videoDurationSec.toFixed(3)] : [];
  const audioFormat = 'aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo';

  let filter: string;
  if (audioPath && bgmPath) {
    filter = [
      `[1:a]${durationFilter(`${audioFormat},apad`)}[voice]`,
      `[2:a]${durationFilter(`${audioFormat},volume=${bgmVolume.toFixed(3)},apad`)}[bgm]`,
      `[voice][bgm]amix=inputs=2:duration=longest:dropout_transition=0${videoDurationSec ? `,atrim=0:${videoDurationSec.toFixed(3)},asetpts=N/SR/TB` : ''}[aout]`,
    ].join(';');
  } else if (audioPath) {
    filter = `[1:a]${durationFilter(`${audioFormat},apad`)}[aout]`;
  } else {
    filter = `[1:a]${durationFilter(`${audioFormat},volume=${bgmVolume.toFixed(3)},apad`)}[aout]`;
  }

  args.push(
    '-filter_complex',
    filter,
    '-map',
    '0:v',
    '-map',
    '[aout]',
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    ...outputDurationArgs,
    outputPath
  );
  await run(args, onLog);
};

/**
 * Probe a media file's duration in seconds via ffprobe.
 * Falls back to ffmpeg if ffprobe isn't on the path.
 */
export const probeDurationSec = async (filePath: string): Promise<number | undefined> => {
  try {
    return await new Promise<number>((resolve, reject) => {
      const p = spawn(
        getFfprobePath(),
        ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', filePath]
      );
      let out = '';
      p.stdout.on('data', (b) => (out += b.toString()));
      p.on('error', reject);
      p.on('close', () => {
        const n = parseFloat(out.trim());
        Number.isFinite(n) ? resolve(n) : reject(new Error('bad duration'));
      });
    });
  } catch {
    return undefined;
  }
};

/**
 * Stage 1: Download external URLs into public/cache/ before they hit Chromium's
 * <Img> delayRender. External fetches inside the renderer are the #1 source of
 * 28s timeout failures. Resolves to a /public-relative URL.
 *
 * Returns the original URL unchanged for /public-relative or data: URIs.
 */
const CACHE_DIR = path.join(process.cwd(), 'public', 'cache');

export const prefetchUrl = async (
  url: string | undefined,
  onLog?: (s: string) => void
): Promise<string | undefined> => {
  if (!url) return url;
  if (url.startsWith('/') || url.startsWith('data:')) return url;
  if (!/^https?:\/\//i.test(url)) return url;

  await mkdir(CACHE_DIR, { recursive: true });
  // Deterministic filename so retries reuse a download.
  const hash = createHash('sha256').update(url).digest('hex').slice(0, 16);
  const ext = (url.split('?')[0].match(/\.([a-z0-9]{2,5})$/i)?.[1] ?? 'bin').toLowerCase();
  const localFile = `${hash}.${ext}`;
  const localPath = path.join(CACHE_DIR, localFile);

  try {
    const st = await stat(localPath);
    if (st.isFile() && st.size > 0) return `/cache/${localFile}`;
  } catch {
    // not cached yet
  }

  // Download with 30s timeout
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok || !res.body) {
      onLog?.(`prefetch: ${url} → HTTP ${res.status}`);
      return url; // fall back to original URL; Chromium will retry
    }
    const tmp = `${localPath}.${randomUUID()}.tmp`;
    await pipeline(Readable.fromWeb(res.body as any), createWriteStream(tmp));
    const { rename } = await import('fs/promises');
    await rename(tmp, localPath);
    onLog?.(`prefetch: cached ${url} → /cache/${localFile}`);
    return `/cache/${localFile}`;
  } catch (e: any) {
    onLog?.(`prefetch failed for ${url}: ${e?.message}`);
    return url;
  } finally {
    clearTimeout(timer);
  }
};

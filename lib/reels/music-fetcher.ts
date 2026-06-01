import path from 'path';
import { readdir } from 'fs/promises';
import fs from 'fs';
import { fetchJamendoTrack } from './jamendo';
import { generateLyriaMusic } from './lyria';
import { getFfmpegPath, getFfprobePath } from './ffmpeg-binaries';

export type BgmMood = 'energetic' | 'calm' | 'emotional' | 'contemplative' | 'news';

export interface BgmResult {
  /** Local file path (use directly with Remotion or upload). */
  filePath: string;
  /** Duration in seconds (from header for WAV, from API metadata for MP3) */
  durationSec: number;
  /** Where the track came from */
  source: 'jamendo' | 'lyria' | 'local' | 'default';
  /** Attribution text (CC-BY tracks need this) */
  attribution?: string;
  /** Suggested volume (0.0-1.0) */
  volume: number;
  /** Public URL relative to public/ (for Remotion staticFile) */
  publicUrl: string;
}

export interface FetchBgmTrimmedOptions extends FetchBgmOptions {
  /** Trim to this duration (seconds). Used to keep base64 data URI small. */
  targetDurationSec: number;
}

export interface FetchBgmOptions {
  mood: BgmMood;
  searchQuery: string;
  genPrompt: string;
  /** Min duration in seconds (default 30) */
  minDurationSec?: number;
  /** Max duration in seconds (default 240) */
  maxDurationSec?: number;
}

const MOOD_VOLUMES: Record<BgmMood, number> = {
  energetic: 0.20,
  calm: 0.15,
  emotional: 0.13,
  news: 0.18,
  contemplative: 0.12,
};

const PUBLIC_DIR = path.join(process.cwd(), 'public');
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.ogg'];
const isAudioFile = (fileName: string) =>
  AUDIO_EXTENSIONS.includes(path.extname(fileName).toLowerCase());

const getDurationSec = async (filePath: string): Promise<number> => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.wav') {
    const fs = await import('fs/promises');
    const buf = await fs.readFile(filePath);
    if (buf.subarray(0, 4).toString() !== 'RIFF') return 0;
    const channels = buf.readUInt16LE(22);
    const sampleRate = buf.readUInt32LE(24);
    const bitsPerSample = buf.readUInt16LE(34);
    const dataSize = buf.readUInt32LE(40);
    const bps = (bitsPerSample / 8) * channels;
    return bps && sampleRate ? dataSize / bps / sampleRate : 0;
  }
  // For MP3, use ffprobe
  return new Promise((resolve) => {
    const { spawn } = require('child_process');
    const proc = spawn(getFfprobePath(), [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);
    let out = '';
    proc.stdout.on('data', (d: Buffer) => (out += d.toString()));
    proc.on('exit', () => {
      const n = parseFloat(out.trim());
      resolve(isFinite(n) ? n : 0);
    });
    proc.on('error', () => resolve(0));
  });
};

const tryLocalLibrary = async (mood: BgmMood): Promise<BgmResult | null> => {
  const dir = path.join(PUBLIC_DIR, 'bgm', mood);
  try {
    const files = await readdir(dir);
    const audio = files.filter(isAudioFile);
    if (audio.length === 0) return null;
    const pick = audio[Math.floor(Math.random() * audio.length)];
    const filePath = path.join(dir, pick);
    const durationSec = await getDurationSec(filePath);
    return {
      filePath,
      durationSec,
      source: 'local',
      volume: MOOD_VOLUMES[mood],
      publicUrl: `/bgm/${mood}/${pick}`,
    };
  } catch {
    return null;
  }
};

const tryCacheLibrary = async (mood: BgmMood): Promise<BgmResult | null> => {
  const dir = path.join(PUBLIC_DIR, 'bgm', '_cache');
  try {
    const files = await readdir(dir);
    const allAudio = files.filter(isAudioFile);
    if (allAudio.length === 0) return null;

    const fullTracks = allAudio.filter((f) => !f.includes('.trimmed.'));
    const candidates = fullTracks.length > 0 ? fullTracks : allAudio;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    const filePath = path.join(dir, pick);
    const durationSec = await getDurationSec(filePath);
    return {
      filePath,
      durationSec,
      source: 'local',
      volume: MOOD_VOLUMES[mood],
      publicUrl: `/bgm/_cache/${pick}`,
    };
  } catch {
    return null;
  }
};

const useDefaultBgm = async (mood: BgmMood): Promise<BgmResult> => {
  const filePath = path.join(PUBLIC_DIR, 'bgm.wav');
  if (!fs.existsSync(filePath)) {
    throw new Error(
      'BGM 파일을 찾을 수 없습니다. public/bgm/{mood}/ 또는 public/bgm/_cache/에 mp3/wav 파일을 추가하거나 원클릭 구성을 다시 실행하세요.'
    );
  }
  const durationSec = await getDurationSec(filePath).catch(() => 18);
  return {
    filePath,
    durationSec: durationSec || 18,
    source: 'default',
    volume: MOOD_VOLUMES[mood],
    publicUrl: '/bgm.wav',
  };
};

/**
 * Trim audio file to target duration using ffmpeg.
 * Faster than re-encoding; just rewrites container with shorter stream.
 */
const trimAudioFile = async (
  inputPath: string,
  outputPath: string,
  durationSec: number
): Promise<void> => {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process');
    const proc = spawn(getFfmpegPath(), [
      '-y',
      '-i', inputPath,
      '-t', String(durationSec),
      '-c', 'copy',
      outputPath,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    proc.stderr.on('data', (d: Buffer) => (err += d.toString()));
    proc.on('exit', (code: number) => {
      code === 0 ? resolve() : reject(new Error(`ffmpeg trim failed: ${err.slice(0, 200)}`));
    });
    proc.on('error', reject);
  });
};

/**
 * Convert BGM file to base64 data URI for use as inputProps.
 * If file is longer than targetDurationSec, trims first to keep size manageable.
 */
export const bgmToDataUri = async (
  bgm: BgmResult,
  targetDurationSec: number
): Promise<{ dataUri: string; sizeBytes: number; durationSec: number }> => {
  const fs = await import('fs/promises');
  let useFilePath = bgm.filePath;
  let actualDuration = bgm.durationSec;

  // Trim if track is significantly longer than needed (saves bandwidth + memory)
  if (bgm.durationSec > targetDurationSec + 2) {
    try {
      const trimmed = bgm.filePath.replace(/(\.[^.]+)$/, '.trimmed$1');
      await trimAudioFile(bgm.filePath, trimmed, targetDurationSec + 2);
      useFilePath = trimmed;
      actualDuration = targetDurationSec + 2;
    } catch (e) {
      console.warn('[bgm] trim failed, using full track:', (e as Error).message);
    }
  }

  const buffer = await fs.readFile(useFilePath);
  const ext = path.extname(useFilePath).toLowerCase();
  const mime =
    ext === '.mp3' ? 'audio/mpeg'
    : ext === '.wav' ? 'audio/wav'
    : ext === '.m4a' ? 'audio/mp4'
    : ext === '.ogg' ? 'audio/ogg'
    : 'audio/mpeg';

  return {
    dataUri: `data:${mime};base64,${buffer.toString('base64')}`,
    sizeBytes: buffer.length,
    durationSec: actualDuration,
  };
};

/**
 * Trim BGM if needed and return its public URL instead of base64 data URI.
 * Guaranteed to be loaded instantly by Chromium without base64 decoding delay.
 */
export const getPlayableBgmUrl = async (
  bgm: BgmResult,
  targetDurationSec: number
): Promise<{ publicUrl: string; durationSec: number }> => {
  const fs = await import('fs/promises');
  let useFilePath = bgm.filePath;
  let actualDuration = bgm.durationSec;
  let usePublicUrl = bgm.publicUrl;

  // Trim if track is significantly longer than needed
  if (bgm.durationSec > targetDurationSec + 2) {
    try {
      const trimmed = bgm.filePath.replace(/(\.[^.]+)$/, '.trimmed$1');
      await trimAudioFile(bgm.filePath, trimmed, targetDurationSec + 2);
      useFilePath = trimmed;
      actualDuration = targetDurationSec + 2;
      usePublicUrl = bgm.publicUrl.replace(/(\.[^.]+)$/, '.trimmed$1');
    } catch (e) {
      console.warn('[bgm] trim failed, using full track:', (e as Error).message);
    }
  }

  return {
    publicUrl: usePublicUrl,
    durationSec: actualDuration,
  };
};

/**
 * Fetch a BGM track with fallback chain. Always returns something usable.
 */
export const fetchBgm = async (opts: FetchBgmOptions): Promise<BgmResult> => {
  const { mood, searchQuery, genPrompt } = opts;
  const minDur = opts.minDurationSec ?? 30;
  const maxDur = opts.maxDurationSec ?? 240;
  const cacheDir = path.join(PUBLIC_DIR, 'bgm', '_cache');

  // 1. Try Jamendo (free)
  if (process.env.JAMENDO_CLIENT_ID) {
    try {
      const dl = await fetchJamendoTrack(searchQuery, cacheDir, {
        minDurationSec: minDur,
        maxDurationSec: maxDur,
      });
      const fileName = path.basename(dl.filePath);
      return {
        filePath: dl.filePath,
        durationSec: dl.durationSec,
        source: 'jamendo',
        attribution: dl.attribution,
        volume: MOOD_VOLUMES[mood],
        publicUrl: `/bgm/_cache/${fileName}`,
      };
    } catch (e) {
      console.warn('[music-fetcher] Jamendo failed, falling back:', (e as Error).message);
    }
  }

  // 2. Try Lyria 2 (paid). Either API key (Express Mode) or service account.
  const hasLyriaAuth =
    (process.env.VERTEX_AI_API_KEY && process.env.VERTEX_AI_PROJECT_ID) ||
    process.env.VERTEX_AI_KEY_JSON ||
    process.env.GOOGLE_TTS_KEY_JSON;
  if (hasLyriaAuth) {
    try {
      const gen = await generateLyriaMusic(genPrompt, cacheDir);
      const fileName = path.basename(gen.filePath);
      return {
        filePath: gen.filePath,
        durationSec: gen.durationSec,
        source: 'lyria',
        attribution: gen.attribution,
        volume: MOOD_VOLUMES[mood],
        publicUrl: `/bgm/_cache/${fileName}`,
      };
    } catch (e) {
      console.warn('[music-fetcher] Lyria failed, falling back:', (e as Error).message);
    }
  }

  // 3. Local library
  const local = await tryLocalLibrary(mood);
  if (local) return local;

  // 4. Previously downloaded/generated cache
  const cached = await tryCacheLibrary(mood);
  if (cached) return cached;

  // 5. Default bgm.wav
  return useDefaultBgm(mood);
};

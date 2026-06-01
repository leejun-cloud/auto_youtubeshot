import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getFfmpegPath, getFfprobePath } from '@/lib/reels/ffmpeg-binaries';

const BGM_TRACKS = {
  energetic: {
    name: 'upbeat.mp3',
    url: 'https://freepd.com/music/Upbeat%20Forever.mp3',
  },
  calm: {
    name: 'calm.mp3',
    url: 'https://freepd.com/music/Relaxing.mp3',
  },
  emotional: {
    name: 'emotional.mp3',
    url: 'https://freepd.com/music/Slow%20Morning.mp3',
  },
  contemplative: {
    name: 'ambient.mp3',
    url: 'https://freepd.com/music/Deep%20Space.mp3',
  },
  news: {
    name: 'news.mp3',
    url: 'https://freepd.com/music/Tech%20Talk.mp3',
  },
};

export async function GET() {
  try {
    const localBinDir = path.join(process.cwd(), 'bin');
    const localFfmpeg = path.join(localBinDir, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
    const localFfprobe = path.join(localBinDir, process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');

    const hasLocalFfmpeg = fs.existsSync(localFfmpeg);
    const hasLocalFfprobe = fs.existsSync(localFfprobe);
    const ffmpegPath = getFfmpegPath();
    const ffprobePath = getFfprobePath();
    const hasStaticFfmpeg = fs.existsSync(ffmpegPath);
    const hasStaticFfprobe = fs.existsSync(ffprobePath);

    const ffmpegOk = hasLocalFfmpeg || hasStaticFfmpeg;
    const ffprobeOk = hasLocalFfprobe || hasStaticFfprobe;

    // Check if we have at least one custom track per mood
    const moods = Object.keys(BGM_TRACKS);
    const moodStatus: Record<string, boolean> = {};
    let customBgmOk = true;
    const isAudioFile = (fileName: string) =>
      ['.mp3', '.wav', '.m4a', '.ogg'].includes(path.extname(fileName).toLowerCase());

    const cacheDir = path.join(process.cwd(), 'public', 'bgm', '_cache');
    const cacheBgmAvailable =
      fs.existsSync(cacheDir) && fs.readdirSync(cacheDir).some(isAudioFile);
    const defaultBgmAvailable = fs.existsSync(path.join(process.cwd(), 'public', 'bgm.wav'));

    for (const mood of moods) {
      const dir = path.join(process.cwd(), 'public', 'bgm', mood);
      let hasMusic = false;
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        hasMusic = files.some(isAudioFile);
      }
      moodStatus[mood] = hasMusic;
      if (!hasMusic) customBgmOk = false;
    }
    customBgmOk = customBgmOk || cacheBgmAvailable || defaultBgmAvailable;

    return NextResponse.json({
      success: true,
      ffmpegInstalled: ffmpegOk,
      ffprobeInstalled: ffprobeOk,
      customBgmInstalled: customBgmOk,
      cacheBgmAvailable,
      defaultBgmAvailable,
      moodStatus,
      platform: process.platform,
      details: {
        hasLocalFfmpeg,
        hasLocalFfprobe,
        hasStaticFfmpeg,
        hasStaticFfprobe,
        ffmpegPath,
        ffprobePath,
      }
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '의존성 확인 중 오류 발생'
    }, { status: 500 });
  }
}

// Downloads static binaries / BGM files on user's machine
export async function POST() {
  try {
    const platform = process.platform;
    const localBinDir = path.join(process.cwd(), 'bin');
    if (!fs.existsSync(localBinDir)) {
      fs.mkdirSync(localBinDir, { recursive: true });
    }

    // 1. Copy FFmpeg/FFprobe to local bin if available and not present
    const ffmpegPath = getFfmpegPath();
    if (fs.existsSync(ffmpegPath)) {
      const destName = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
      const destPath = path.join(localBinDir, destName);
      if (!fs.existsSync(destPath)) {
        fs.copyFileSync(ffmpegPath, destPath);
        fs.chmodSync(destPath, 0o755);
      }
    }
    
    const ffprobePath = getFfprobePath();
    if (fs.existsSync(ffprobePath)) {
      const destName = platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';
      const destPath = path.join(localBinDir, destName);
      if (!fs.existsSync(destPath)) {
        fs.copyFileSync(ffprobePath, destPath);
        fs.chmodSync(destPath, 0o755);
      }
    }

    // 2. Download free BGM tracks for each mood
    console.log('[API Installer] Downloading CC0 BGM tracks...');
    for (const [mood, info] of Object.entries(BGM_TRACKS)) {
      const dir = path.join(process.cwd(), 'public', 'bgm', mood);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const destPath = path.join(dir, info.name);
      // Only download if no files exist in the folder to avoid overwriting user files
      const existingFiles = fs.readdirSync(dir).filter(f => ['.mp3', '.wav', '.m4a', '.ogg'].includes(path.extname(f).toLowerCase()));
      
      if (existingFiles.length === 0) {
        try {
          const res = await fetch(info.url);
          if (res.ok) {
            const buffer = await res.arrayBuffer();
            fs.writeFileSync(destPath, Buffer.from(buffer));
            console.log(`[API Installer] Saved BGM: ${mood}/${info.name}`);
          }
        } catch (err) {
          console.error(`[API Installer] Failed to download BGM for ${mood}:`, err);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: '성공적으로 필수 프로그램 및 분위기별 추천 배경음악 설치를 완료했습니다.'
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '필수 구성 설치 실패'
    }, { status: 500 });
  }
}

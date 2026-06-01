import fs from 'fs';
import path from 'path';

const TRACKS = {
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

const downloadTrack = async (mood, info) => {
  const destDir = path.join(process.cwd(), 'public', 'bgm', mood);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  
  const destPath = path.join(destDir, info.name);
  console.log(`[BGM 다운로더] ${mood} 음악 다운로드 중...`);
  
  try {
    const res = await fetch(info.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    fs.writeFileSync(destPath, Buffer.from(arrayBuffer));
    console.log(`[BGM 다운로더] ✅ 저장 완료: ${mood}/${info.name}`);
  } catch (e) {
    console.error(`[BGM 다운로더] ❌ 실패 (${mood}):`, e.message);
  }
};

const main = async () => {
  for (const [mood, info] of Object.entries(TRACKS)) {
    await downloadTrack(mood, info);
  }
  console.log('[BGM 다운로더] 모두 완료되었습니다.');
};

main().catch(console.error);

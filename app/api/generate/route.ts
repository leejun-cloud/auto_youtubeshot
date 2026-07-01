import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { structurePhotoContent } from '@/lib/reels/photo-structure';
import { fetchPhoto } from '@/lib/reels/photo-fetcher';
import { fetchBgm } from '@/lib/reels/music-fetcher';
import { concatenateWavs, synthesizeKoreanNarration } from '@/lib/reels/tts';
import { renderReel } from '@/lib/reels/render';
import { muxAudio } from '@/lib/reels/render-ffmpeg';
import { generateMetadata } from '@/lib/reels/metadata';

export let currentRenderStatus = {
  step: 'idle',
  progress: 0,
  message: '대기 중...',
  error: null as string | null,
};

const SCENE_GAP_SEC = 0.3;

export async function POST(request: NextRequest) {
  try {
    const { text, title, keys } = await request.json();

    if (!text) {
      return NextResponse.json({ error: '본문 텍스트가 필요합니다.' }, { status: 400 });
    }

    const geminiApiKey = keys?.geminiApiKey || process.env.GEMINI_API_KEY;
    const pexelsApiKey = keys?.pexelsApiKey || process.env.PEXELS_API_KEY;

    if (!geminiApiKey) {
      return NextResponse.json({ error: 'Gemini API 키가 설정되지 않았습니다.' }, { status: 400 });
    }

    // Reset status
    currentRenderStatus = {
      step: 'structuring',
      progress: 5,
      message: 'Gemini AI를 활용해 텍스트를 카드구조로 분석하는 중...',
      error: null,
    };

    // Set environment keys dynamically for the child modules that read them directly
    process.env.GEMINI_API_KEY = geminiApiKey;
    if (pexelsApiKey) process.env.PEXELS_API_KEY = pexelsApiKey;

    const timestamp = Date.now();
    const outDir = path.join(process.cwd(), 'public', 'reels', `photo-${timestamp}`);
    await mkdir(outDir, { recursive: true });

    // Step 1: Structure content
    console.log('[API] Structuring content via Gemini...');
    const structure = await structurePhotoContent(text, title, geminiApiKey);

    currentRenderStatus = {
      step: 'media',
      progress: 20,
      message: 'Pexels에서 테마에 맞는 고해상도 배경 이미지 매칭 중...',
      error: null,
    };
    
    const coverMedia = await fetchPhoto(structure.coverImageSearchQuery, pexelsApiKey);
    
    const cardMediaResults: any[] = [];
    for (let i = 0; i < structure.cards.length; i++) {
      const card = structure.cards[i];
      const media = await fetchPhoto(card.imageSearchQuery, pexelsApiKey);
      cardMediaResults.push(media);
      currentRenderStatus = {
        step: 'media',
        progress: 20 + Math.round(((i + 1) / structure.cards.length) * 20),
        message: `배경 이미지 매칭 중... (카드 ${i + 1}/${structure.cards.length} 다운로드 완료)`,
        error: null,
      };
    }

    // Step 3: Fetch BGM
    console.log('[API] Fetching BGM...');
    const bgm = await fetchBgm({
      mood: structure.bgmMood,
      searchQuery: structure.musicSearchQuery,
      genPrompt: structure.musicGenPrompt,
    });

    currentRenderStatus = {
      step: 'tts',
      progress: 45,
      message: '한국어 TTS 음성 합성 중...',
      error: null,
    };

    // Step 4: Generate TTS Segments in Parallel
    console.log('[API] Synthesizing TTS...');
    const segments: any[] = [];
    for (let i = 0; i < structure.narrationSegments.length; i++) {
      const segText = structure.narrationSegments[i];
      const r = await synthesizeKoreanNarration(segText, {
        apiKey: geminiApiKey,
        voiceName: 'Kore'
      });
      segments.push({ audioBuffer: r.audioBuffer, durationSec: r.durationSec });
      currentRenderStatus = {
        step: 'tts',
        progress: 45 + Math.round(((i + 1) / structure.narrationSegments.length) * 20),
        message: `한국어 TTS 음성 합성 중... (성우 나레이션 ${i + 1}/${structure.narrationSegments.length} 완료)`,
        error: null,
      };
    }
    
    const totalAudioSec =
      segments.reduce((s, x) => s + x.durationSec, 0) +
      SCENE_GAP_SEC * Math.max(0, segments.length - 1);

    const concatenatedAudio = concatenateWavs(segments.map((s) => s.audioBuffer), SCENE_GAP_SEC);
    const ttsDir = path.join(process.cwd(), 'public', 'tts');
    await mkdir(ttsDir, { recursive: true });
    const audioPath = path.join(ttsDir, `narration-concat-${timestamp}.wav`);
    await writeFile(audioPath, concatenatedAudio);
    const sceneDurations = segments.map(
      (s, i) => s.durationSec + (i < segments.length - 1 ? SCENE_GAP_SEC : 0)
    );

    currentRenderStatus = {
      step: 'rendering',
      progress: 65,
      message: 'Remotion 그래픽 엔진 가동... (준비 완료)',
      error: null,
    };

    // Step 5: Render Video via Remotion
    console.log('[API] Rendering Remotion video...');
    const renderData = {
      hookHeadline: structure.hookHeadline,
      coverImageDataUri: coverMedia?.dataUri,
      coverMediaType: coverMedia?.mediaType || 'image',
      cards: structure.cards.map((card, i) => ({
        headline: card.headline,
        body: card.body,
        imageDataUri: cardMediaResults[i]?.dataUri,
        mediaType: cardMediaResults[i]?.mediaType || 'image',
      })),
      cta: structure.cta,
      audioDurationSec: totalAudioSec,
      sceneDurationsSec: sceneDurations,
    };

    // 디버그: 오디오 값 확인
    console.log('[API] 🎵 BGM source:', bgm.source, '| volume:', bgm.volume, '| trackDuration:', bgm.durationSec);
    console.log('[API] 🎵 BGM file:', bgm.filePath);
    console.log('[API] 🔊 narration file:', audioPath);
    console.log('[API] 🔊 totalAudioSec:', totalAudioSec);

    const silentFileName = `photo-${timestamp}.silent.mp4`;
    const finalFileName = `photo-${timestamp}.mp4`;
    const renderResult = await renderReel({
      template: 'photo',
      data: renderData,
      outputFileName: silentFileName,
      forceRebundle: true, // TTS/BGM 파일이 방금 생성됐으므로 번들 캐시 무효화
      onProgress: (prog) => {
        currentRenderStatus = {
          step: 'rendering',
          progress: 65 + Math.round(prog * 20),
          message: `Remotion 비디오 그래픽 프레임 인코딩 중... (${Math.round(prog * 100)}%)`,
          error: null,
        };
      }
    });

    currentRenderStatus = {
      step: 'rendering',
      progress: 86,
      message: '내레이션과 배경음악을 ffmpeg로 최종 믹싱 중...',
      error: null,
    };

    const finalPath = path.join(process.cwd(), 'public', 'reels', finalFileName);
    await muxAudio(
      renderResult.localPath,
      audioPath,
      bgm.filePath,
      bgm.volume,
      finalPath,
      (line) => console.log('[ffmpeg audio]', line)
    );
    await unlink(renderResult.localPath).catch(() => undefined);

    const finalRenderResult = {
      ...renderResult,
      localPath: finalPath,
      fileName: finalFileName,
      publicUrl: `/reels/${finalFileName}`,
    };

    currentRenderStatus = {
      step: 'metadata',
      progress: 88,
      message: '유튜브/인스타 마케팅 텍스트 생성 중...',
      error: null,
    };

    // Step 6: Generate Metadata (copy-paste fields)
    console.log('[API] Generating metadata...');
    const metadata = await generateMetadata({
      text,
      template: 'photo',
      data: {
        hookHeadline: structure.hookHeadline,
        cards: structure.cards.map((c) => ({ headline: c.headline, body: c.body })),
        cta: structure.cta,
      },
      narration: structure.narration,
    }, geminiApiKey);

    // Override YT title with hook headline for CTR optimization
    if (!metadata.youtubeTitle.includes(structure.hookHeadline)) {
      const hook = structure.hookHeadline.slice(0, 70);
      metadata.youtubeTitle = `${hook} #Shorts`.slice(0, 100);
    }

    currentRenderStatus = {
      step: 'done',
      progress: 100,
      message: '완료! 비디오와 유튜브 마케팅 텍스트가 정상 발행되었습니다.',
      error: null,
    };

    return NextResponse.json({
      success: true,
      videoUrl: finalRenderResult.publicUrl,
      fileName: finalRenderResult.fileName,
      metadata,
    });
  } catch (error) {
    let errorMsg = error instanceof Error ? error.message : '비디오 생성 파이프라인 처리 중 오류가 발생했습니다.';
    // Gemini 할당량 초과(429)를 초보자용 한국어 안내로 변환 (이미 변환됐으면 유지)
    const isQuota = errorMsg.includes('429') || errorMsg.includes('RESOURCE_EXHAUSTED') || /quota/i.test(errorMsg);
    if (isQuota && !errorMsg.includes('할당량')) {
      errorMsg =
        'Gemini 무료 사용량(할당량)을 초과했습니다. 잠시(1~2분) 후 다시 시도하거나, ' +
        'Google AI Studio(https://aistudio.google.com)에서 결제를 등록해 할당량을 늘려주세요.';
    }
    console.error('[generate] Error in pipeline:', error);
    currentRenderStatus = {
      step: 'error',
      progress: 0,
      message: '에러 발생',
      error: errorMsg,
    };
    return NextResponse.json(
      { error: errorMsg },
      { status: 500 }
    );
  }
}

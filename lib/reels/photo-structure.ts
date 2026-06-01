// Structure raw content for PhotoCardReel: extract hook headline, 2-4 cards, image prompts.
// Uses Gemini to produce the minimal but punchy 손힘찬-style card structure.

import { GoogleGenAI, Type } from '@google/genai';

export interface PhotoCardData {
  headline: string;           // Bold text on card (15자 이내, punch)
  body: string;               // Supporting line (30자 이내, 1 line)
  imagePrompt: string;        // English prompt for Imagen 3 (legacy)
  imageSearchQuery: string;   // English keywords for Pixabay/Pexels stock search
}

export interface PhotoStructureResult {
  hookHeadline: string;           // Cover hook (20자 이내, stops the scroll)
  coverImagePrompt: string;       // English prompt for cover image (legacy)
  coverImageSearchQuery: string;  // English keywords for cover stock search
  cards: PhotoCardData[];         // 2-4 body cards
  cta: string;                    // CTA text (15자 이내)
  narration: string;              // Full narration
  narrationSegments: string[];    // Per-scene: [cover, card1…cardN, cta]
  bgmMood: 'energetic' | 'calm' | 'emotional' | 'contemplative' | 'news';
  musicSearchQuery: string;
  musicGenPrompt: string;
}

const SYSTEM = `당신은 한국 SNS 포토 카드뉴스 기획자입니다.
본문을 받아서 손힘찬(@ogata_marito) 스타일의 포토 카드뉴스로 구조화하세요.

[포토 카드뉴스 구조 원칙]
- 표지(cover): 스크롤을 멈추게 할 강력한 1줄 후킹
- 카드 5-7장: 각 카드마다 핵심 헤드라인과 풍부한 부연설명 작성 (전체 영상 길이 60초 내외 확보 목적)
- CTA: 구체적인 행동 1줄

[hookHeadline 작성 규칙]
- 20자 이내
- 6가지 후킹 패턴 중 가장 강한 것: 충격/수치/질문/긴급/권위/반전
- 예: "97%가 모르는 진실", "지금 당장 멈추세요", "당신은 왜 성공 못 할까?"

[cards[].headline 규칙]
- 15자 이내, 핵심 한 문장
- 동사형보다 명사형이 더 강함
- 예: "진짜 공부", "뇌는 거짓말한다", "3분이면 충분"

[cards[].body 규칙]
- 30자 이내, 한 줄 부연
- headline만으로 이해 가능하면 생략 가능하나 일반적으로 제공

[imagePrompt 작성 규칙]
- 반드시 영어로
- 반드시 "No text, no words, no letters" 포함
- 배경용: 사람 얼굴보다 분위기/사물/추상적 장면
- cinematic, dramatic, dark/moody 스타일 권장
- 예: "Dramatic dark office background, scattered papers, moody lighting, cinematic, no text, no words"

[imageSearchQuery / coverImageSearchQuery 작성 규칙]
- 반드시 영어로 (Pixabay/Pexels 검색용)
- 2-4개 키워드, 구체적이고 시각적인 명사
- 분위기/사물/장소 중심, 배경으로 쓸 수 있는 것
- 예: "dark office night deadline", "morning coffee journal", "person running motivation"

[narrationSegments]
- 배열 길이 = cards.length + 2 (표지 + N카드 + CTA)
- 각 segment: 해당 장면 재생 중 읽을 내레이션 (6-8초 분량, 40-70자)
- 전체 나레이션 총합이 1분(60초) 내외가 되도록 각 장면마다 충분히 상세한 설명을 포함하여 작성하세요.
- 표지 segment: 후킹 질문 또는 문제 제기
- 카드 segments: 각 카드 핵심을 상세히 한두 문장으로 설명
- CTA segment: 마무리 행동 권유

[bgmMood]
- energetic: 동기부여·실천 권유
- calm: 정보·학습
- emotional: 감동·사연
- contemplative: 통찰·명언
- news: 발표·공지`;

const SCHEMA = {
  type: Type.OBJECT,
  properties: {
    hookHeadline: { type: Type.STRING },
    coverImagePrompt: { type: Type.STRING },
    coverImageSearchQuery: { type: Type.STRING },
    cards: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          headline: { type: Type.STRING },
          body: { type: Type.STRING },
          imagePrompt: { type: Type.STRING },
          imageSearchQuery: { type: Type.STRING },
        },
        required: ['headline', 'body', 'imagePrompt', 'imageSearchQuery'],
      },
    },
    cta: { type: Type.STRING },
    narration: { type: Type.STRING },
    narrationSegments: { type: Type.ARRAY, items: { type: Type.STRING } },
    bgmMood: {
      type: Type.STRING,
      enum: ['energetic', 'calm', 'emotional', 'contemplative', 'news'],
    },
    musicSearchQuery: { type: Type.STRING },
    musicGenPrompt: { type: Type.STRING },
  },
  required: [
    'hookHeadline',
    'coverImagePrompt',
    'coverImageSearchQuery',
    'cards',
    'cta',
    'narration',
    'narrationSegments',
    'bgmMood',
    'musicSearchQuery',
    'musicGenPrompt',
  ],
};

export const structurePhotoContent = async (
  text: string,
  titleHint?: string,
  geminiApiKey?: string
): Promise<PhotoStructureResult> => {
  const apiKey = geminiApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY 미설정');

  const ai = new GoogleGenAI({ apiKey });
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  const prompt = titleHint ? `제목 힌트: "${titleHint}"\n\n본문:\n${text}` : text;

  const res = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction: SYSTEM,
      responseMimeType: 'application/json',
      responseSchema: SCHEMA,
    },
  });

  const parsed = JSON.parse(res.text || '{}') as PhotoStructureResult;

  // Fallbacks
  if (!parsed.hookHeadline) parsed.hookHeadline = titleHint || '지금 꼭 알아야 할 것';
  if (!parsed.coverImageSearchQuery) parsed.coverImageSearchQuery = 'dramatic dark background cinematic';
  if (!Array.isArray(parsed.cards) || parsed.cards.length === 0) {
    parsed.cards = [
      {
        headline: '핵심 내용',
        body: text.slice(0, 30),
        imagePrompt: 'Dark dramatic background, moody lighting, no text, no words, cinematic',
        imageSearchQuery: 'dark background motivation',
      },
    ];
  }
  parsed.cards = parsed.cards.map((c) => ({
    ...c,
    imageSearchQuery: c.imageSearchQuery || 'dark cinematic background',
  }));
  if (!parsed.cta) parsed.cta = '저장하고 실천하세요';

  // Validate narrationSegments count matches scenes
  const expectedSegments = parsed.cards.length + 2;
  if (
    !Array.isArray(parsed.narrationSegments) ||
    parsed.narrationSegments.length !== expectedSegments
  ) {
    const sentences = (parsed.narration || '')
      .split(/(?<=[.!?])\s+|\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    // Pad or trim to expected length
    while (sentences.length < expectedSegments) sentences.push('');
    parsed.narrationSegments = sentences.slice(0, expectedSegments);
  }

  return parsed;
};

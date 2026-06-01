// Generate click-optimized social media metadata using Gemini.
// Different platforms have different best practices:
// - Instagram: emotional hook in first line, 25-30 hashtags
// - YouTube Shorts: SEO-friendly title (~60 chars), keyword tags

import { GoogleGenAI, Type } from '@google/genai';

export interface PlatformMetadata {
  /** Instagram caption (full post text including hooks + hashtags) */
  instagramCaption: string;
  /** Just the hashtags (already integrated in instagramCaption but provided separately) */
  instagramHashtags: string[];
  /** YouTube Shorts title (max 100 chars, recommend < 60) */
  youtubeTitle: string;
  /** YouTube description (max 5000 chars, key info in first 3 lines) */
  youtubeDescription: string;
  /** YouTube tags array (max 30, total <= 500 chars) */
  youtubeTags: string[];
}

const DEFAULT_MODEL = 'gemini-3-flash-preview';

const SYSTEM_INSTRUCTION = `당신은 한국어 소셜 미디어 마케팅 전문가입니다.
주어진 영상 콘텐츠 정보로 클릭률(CTR)을 극대화할 수 있는 메타데이터를 작성하세요.

[Instagram Reels 캡션 작성 규칙]
- 첫 줄(첫 90자)은 가장 중요. 스크롤을 멈추게 할 강한 후킹.
  · 질문형, 충격적 수치, 공감 포인트, "이거 모르면 손해" 같은 호기심 유발
- 줄바꿈으로 가독성 확보 (모바일 화면 기준)
- 이모지 적절히 사용 (1-3줄마다 1개 정도)
- CTA: "저장 / 댓글 / 공유" 명시
- 끝에 해시태그 25-30개 자연스럽게 배치
- 전체 길이 1500-2000자 권장

[Instagram 해시태그 전략 — 25-30개 혼합]
- 메가 해시태그 (1M+ 게시물): 3-5개  (예: #일상 #스타그램 #데일리)
- 미디엄 (100K-1M): 10-12개 (콘텐츠 분야 주제어)
- 니치 (1만-10만): 10-12개 (구체적 타겟층)
- 한국어 + 영어 혼합 권장

[YouTube Shorts 제목 작성 규칙]
- 60자 이내 (모바일 검색 결과에서 잘리지 않음)
- 숫자 활용: "5가지", "30초만에", "이것만 하면"
- 호기심 유발: "절대 ~하지 마세요", "충격적인 ~", "아무도 모르는 ~"
- 검색 키워드 자연스럽게 포함
- 끝에 #Shorts 권장

[YouTube 설명 작성 규칙]
- 첫 3줄(약 150자)에 영상 핵심 + 검색 키워드
- 영상 내용 요약 (3-5줄)
- 관련 자료/링크 자리 ("---" 구분선 사용)
- 끝에 해시태그 3-5개

[YouTube 태그 (검색 SEO용) — 15-20개]
- 핵심 키워드부터 시작 (가장 중요한 검색어)
- 구체적 → 일반적 순서
- 한국어 + 영어 혼합
- 각 태그 30자 이내, 전체 합계 500자 이내

각 플랫폼의 알고리즘 특성을 고려해서 같은 콘텐츠라도 표현을 다르게 작성하세요.`;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    instagramCaption: { type: Type.STRING },
    instagramHashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
    youtubeTitle: { type: Type.STRING },
    youtubeDescription: { type: Type.STRING },
    youtubeTags: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: [
    'instagramCaption',
    'instagramHashtags',
    'youtubeTitle',
    'youtubeDescription',
    'youtubeTags',
  ],
};

export interface MetadataInput {
  /** Original full text content */
  text: string;
  /** Classified template type (action, list, etc.) */
  template: string;
  /** Extracted structured data */
  data: Record<string, unknown>;
  /** Generated narration (optional, for context) */
  narration?: string;
}

export const generateMetadata = async (
  input: MetadataInput,
  geminiApiKey?: string
): Promise<PlatformMetadata> => {
  const apiKey = geminiApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY 미설정');
  }

  const ai = new GoogleGenAI({ apiKey });
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  const prompt = `[영상 분류] ${input.template}
[추출된 핵심 데이터]
${JSON.stringify(input.data, null, 2)}

[원본 본문]
${input.text}

${input.narration ? `[영상 내레이션]\n${input.narration}\n` : ''}
위 콘텐츠로 Instagram Reels와 YouTube Shorts에 동시 발행할 메타데이터를 작성하세요.`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    },
  });

  const parsed = JSON.parse(response.text || '{}') as PlatformMetadata;

  // Validate
  const requiredFields: (keyof PlatformMetadata)[] = [
    'instagramCaption',
    'instagramHashtags',
    'youtubeTitle',
    'youtubeDescription',
    'youtubeTags',
  ];
  for (const f of requiredFields) {
    if (!parsed[f]) throw new Error(`Metadata missing field: ${f}`);
  }

  // Truncate to platform limits
  parsed.youtubeTitle = parsed.youtubeTitle.slice(0, 100);
  parsed.youtubeDescription = parsed.youtubeDescription.slice(0, 5000);
  parsed.youtubeTags = parsed.youtubeTags.slice(0, 30);

  return parsed;
};

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const SYSTEM_PROMPT = `당신은 숏폼(유튜브 쇼츠, 인스타 릴스) 카드뉴스용 전문 기획자이자 카피라이터입니다.
사용자가 입력한 주제나 초안을 바탕으로, 손힘찬 style의 메시지 강도가 높고 전체 영상 길이가 1분(60초) 내외가 되는 숏폼 카드뉴스 스크립트를 작성하세요.

[스크립트 구성 요소]
1. 표지 후킹 제목 (1줄): 20자 이내. 질문형, 충격형, 반전형 등 강력한 문장.
2. 카드뉴스 본문 (5~7장): 각 장마다 [카드 N]으로 표시하고, 굵고 짧은 헤드라인(15자 이내)과 1줄 부연설명(30자 이내)으로 구성하세요. (1분 영상 확보를 위해 5장 이상 필수)
3. CTA (행동 유도 1줄): 마무리 행동 실천 유도.
4. 나레이션 (전체 흐름): 영상 전반에 깔릴 읽기 쉬운 한국어 대본. 1분 분량이 나오도록 충분히 서사적이고 매끄럽게 작성해 주세요. (약 7-9문장)

[출력 양식]
아래 양식을 엄격히 지켜 한국어로만 출력해 주세요. 부가 설명이나 인사말은 생략하세요:

제목: [표지 후킹 제목]

본문:
- [카드 1] 헤드라인 / 부연설명
- [카드 2] 헤드라인 / 부연설명
- [카드 3] 헤드라인 / 부연설명
- [카드 4] 헤드라인 / 부연설명
- [카드 5] 헤드라인 / 부연설명
- [카드 6] 헤드라인 / 부연설명 (선택)
- [카드 7] 헤드라인 / 부연설명 (선택)

CTA: [행동 유도 문구]

나레이션:
[전체 나레이션 텍스트 (충분히 상세히 적어주세요)]`;

export async function POST(request: NextRequest) {
  try {
    const { prompt, geminiApiKey } = await request.json();

    if (!prompt) {
      return NextResponse.json({ error: '주제나 본문을 입력해 주세요.' }, { status: 400 });
    }

    const apiKey = geminiApiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API 키가 필요합니다. 설정 패널을 확인해 주세요.' }, { status: 400 });
    }

    const ai = new GoogleGenAI({ apiKey });
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_PROMPT,
      },
    });

    const scriptText = response.text || '';

    return NextResponse.json({
      success: true,
      script: scriptText.trim(),
    });
  } catch (error) {
    console.error('[write-script] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '스크립트 생성 실패' },
      { status: 500 }
    );
  }
}

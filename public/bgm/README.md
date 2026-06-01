# BGM 라이브러리

Gemini가 콘텐츠 분석 후 5개 무드 중 하나를 선택하면, 해당 폴더에서 트랙을 랜덤으로 골라요.

## 폴더 구조

| 폴더 | 무드 | 어떤 콘텐츠? |
|---|---|---|
| `energetic/` | 에너지·드럼·업비트 | 챌린지, 운동, 동기부여, 실천 권유 |
| `calm/` | 차분·피아노·어쿠스틱 | 학습, 정보 전달, 일반 가이드 |
| `emotional/` | 감성·스트링·따뜻함 | 사연, 간증, 감동 스토리 |
| `news/` | 코퍼레이트·뉴스 톤 | 발표, 공지, 행사 안내 |
| `contemplative/` | 앰비언트·미니멀 | 명언, 통찰, 사색 |

각 폴더에 **MP3 / WAV / M4A** 파일을 넣으면 자동으로 인식돼요.

## 추천 다운로드 사이트

### 무료·저작권 자유 (CC0)

| 사이트 | 특징 | 권장 |
|---|---|---|
| **Pixabay Music** (pixabay.com/music) | CC0, 출처 표기 불필요, 가입 무료 | ⭐⭐⭐ 가장 추천 |
| **YouTube Audio Library** | 구글 계정만 있으면 무료, 광범위한 라이브러리 | ⭐⭐⭐ |
| **Mixkit** (mixkit.co/free-stock-music) | 가입 없이 직접 다운로드 | ⭐⭐ |
| **Free Music Archive** (freemusicarchive.org) | 다양한 장르 | ⭐⭐ |

### 유료지만 좋음

| 사이트 | 특징 |
|---|---|
| **Epidemic Sound** | 월 구독, 무제한 사용 |
| **Artlist** | 영상 제작자 표준 |
| **Uppbeat** (uppbeat.io) | 무료 티어 + 유료 |

### AI 음악 생성 (가장 미래지향적)

| 서비스 | 비고 |
|---|---|
| **Suno** (suno.com) | 텍스트로 음악 생성, 이용권 결제 |
| **Mubert** (mubert.com) | API 무료 티어, 분위기 키워드로 생성 |
| **Stability Audio** | Stable Audio Diffusion |

## 트랙 선택 팁

### 길이
- **추천**: 1-3분 트랙 (영상보다 길면 자동으로 한 번만 재생, 자연스럽게 잘림)
- 짧은 트랙(<30초)은 루프 경계가 부자연스러울 수 있음

### 분위기 매칭
영상 콘텐츠 분류:
- "운동 30일 챌린지" → `energetic/`
- "AI 시대 평가법" → `calm/` (정보형)
- "30년 만에 친구를 다시 만났다" → `emotional/`
- "2026 봄 컨퍼런스 개최" → `news/`
- "성공의 비결은 단순함이다" → `contemplative/`

## 파일 명명 규칙

자유롭게 지으세요. 시스템이 폴더 안의 모든 오디오 파일을 인식해요.

예시:
```
public/bgm/
├── energetic/
│   ├── upbeat-rock.mp3
│   ├── motivational-drums.mp3
│   └── fitness-electronic.mp3
├── calm/
│   ├── piano-study.mp3
│   ├── lofi-coffee.mp3
│   └── acoustic-warm.mp3
├── emotional/
│   └── ...
```

## 빠른 시작 — Pixabay에서 한 번에 받기

1. https://pixabay.com/music 접속
2. 검색어 예시:
   - `motivational` → energetic 폴더용
   - `lofi study` → calm 폴더용
   - `emotional piano` → emotional 폴더용
   - `corporate background` → news 폴더용
   - `ambient minimal` → contemplative 폴더용
3. 각 무드별 **2-3곡** 다운로드 → 해당 폴더에 저장
4. 끝! 다음 영상 생성부터 자동 적용

## 폴더가 비어있으면?

해당 무드에 트랙이 없으면 **`public/bgm.wav` (기본 트랙)** 으로 자동 폴백돼요. 시스템은 멈추지 않으니 부담없이 천천히 채우세요.

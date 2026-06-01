#!/bin/bash
cd "$(dirname "$0")"

echo "========================================================="
echo "🎬 C형 포토 카드뉴스 숏폼 제작기 구동기 (Mac)"
echo "========================================================="
echo ""

echo "━━━ [1/2] 필수 모듈 설치 및 업데이트 ━━━"
echo "▶ 의존성 설치를 진행합니다 (보통 몇 초 소요됩니다)..."
npm install --no-audit --no-fund
echo ""

echo "━━━ [2/2] 비디오 렌더링 엔진 시작 (포트 자동 탐색) ━━━"
# Runs start-app.mjs which handles port selection and browser opening
node scripts/start-app.mjs

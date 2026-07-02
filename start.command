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

echo "━━━ [1.5/2] 렌더링용 브라우저 사전 준비 ━━━"
node scripts/warmup.mjs || { echo "[ERROR] 브라우저 준비 실패 — Chrome 설치 또는 네트워크 확인 후 재실행"; read -r; exit 1; }
echo ""

echo "━━━ [2/2] 비디오 렌더링 엔진 시작 (포트 자동 탐색) ━━━"
# Runs start-app.mjs which handles port selection and browser opening
node scripts/start-app.mjs

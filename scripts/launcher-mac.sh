#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# launcher-mac.sh
# C-Type Photo Reels Generator — macOS launcher
# PhotoReels.app 내부 또는 직접 실행 모두 지원
# ─────────────────────────────────────────────────────────────────────────────

# ── Project root 계산 ────────────────────────────────────────────────────────
# 호출 경로에 따라 ROOT 결정:
#   .app에서: <dist>/PhotoReels.app/Contents/MacOS/../../../ → dist root
#   직접 실행: scripts/ → 한 단계 위
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# .app 번들 내부에서 실행 중인지 확인 (Contents/MacOS 경로 포함)
if echo "$SCRIPT_DIR" | grep -q "Contents/MacOS"; then
  ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
else
  ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
fi

RUNTIME="$ROOT/runtime"
NODE="$RUNTIME/bin/node"
NPM="$RUNTIME/bin/npm"
NEXT_BIN="$ROOT/node_modules/next/dist/bin/next"

echo "============================================================"
echo "  C-Type Photo Reels Generator"
echo "============================================================"
echo ""
echo "  Project: $ROOT"
echo ""

# ── runtime 확인 ──────────────────────────────────────────────────────────────
if [ ! -f "$NODE" ]; then
  echo "[ERROR] runtime/bin/node not found."
  echo "        Please re-download the full package."
  osascript -e 'display alert "Runtime Missing" message "runtime/ 폴더가 없습니다.\n패키지를 다시 다운로드해 주세요." as critical' 2>/dev/null || true
  exit 1
fi

# runtime/bin을 PATH 앞에 추가 → npm이 올바른 node를 사용하도록
export PATH="$RUNTIME/bin:$PATH"

NODE_VER="$("$NODE" -v 2>/dev/null)"
echo "[OK] Node.js $NODE_VER (Universal binary)"
echo ""

# ── npm install ───────────────────────────────────────────────────────────────
echo "[1/2] Installing dependencies..."
echo "      (First run may take a few minutes — please wait)"
echo ""

cd "$ROOT"
"$NPM" install --no-audit --no-fund

if [ $? -ne 0 ]; then
  echo ""
  echo "[ERROR] npm install failed."
  echo "        Check your internet connection and try again."
  exit 1
fi

echo ""
echo "[OK] Dependencies ready!"
echo ""

# ── next.js 바이너리 확인 ──────────────────────────────────────────────────────
if [ ! -f "$NEXT_BIN" ]; then
  echo "[ERROR] Next.js not found after install."
  exit 1
fi

# ── 빈 포트 찾기 ──────────────────────────────────────────────────────────────
PORT=3000
while lsof -i:"$PORT" > /dev/null 2>&1; do
  echo "      Port $PORT in use, trying next..."
  PORT=$((PORT + 1))
done
URL="http://localhost:$PORT"

# ── 서버 시작 ─────────────────────────────────────────────────────────────────
echo "[2/2] Starting server on port $PORT..."
echo "      Do NOT close this window while using the app."
echo ""

# 5초 후 브라우저 열기 (백그라운드)
(sleep 5 && open "$URL") &

# Next.js 실행 (foreground)
"$NODE" "$NEXT_BIN" dev -p "$PORT"

echo ""
echo "Server stopped. Press Enter to close..."
read -r

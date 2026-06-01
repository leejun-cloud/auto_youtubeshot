@echo off
chcp 65001 >nul 2>&1
title C-Type Photo Reels Generator (Windows)
cd /d "%~dp0"

echo ===========================================================
echo   C-Type Photo Reels Generator
echo ===========================================================
echo.

:: ── [1/3] Check Node.js ─────────────────────────────────────
echo [1/3] Checking Node.js...
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
  echo.
  echo [INFO] Node.js is not installed. Downloading installer...
  curl -L -o node_installer.msi "https://nodejs.org/dist/v20.13.1/node-v20.13.1-x64.msi"
  if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Download failed. Please check your internet connection.
    echo         Or install manually from: https://nodejs.org
    pause
    exit /b 1
  )
  echo.
  echo [ACTION] Node.js installer will now open.
  echo          Click "Next" until installation is complete.
  echo.
  start /wait msiexec /i node_installer.msi /qn ADDLOCAL=ALL
  del node_installer.msi
  echo.
  echo [DONE] Node.js installed.
  echo        Please CLOSE this window and run start.bat again.
  pause
  exit /b 0
)

for /f "tokens=*" %%v in ('node -v 2^>^&1') do set NODE_VER=%%v
echo Node.js %NODE_VER% found - OK
echo.

:: ── [2/3] Install dependencies ──────────────────────────────
echo [2/3] Installing dependencies (first run may take a few minutes)...
echo.
call npm install --no-audit --no-fund
set NPM_ERR=%ERRORLEVEL%

if %NPM_ERR% neq 0 (
  echo.
  echo [ERROR] npm install failed. (exit code: %NPM_ERR%)
  echo   - Check your internet connection.
  echo   - Try right-clicking start.bat and select "Run as Administrator".
  pause
  exit /b 1
)
echo.
echo Dependencies installed successfully!
echo.

:: ── [3/3] Start app server ───────────────────────────────────
echo [3/3] Starting App Server...
echo       Browser will open automatically. Do NOT close this window.
echo.
node scripts/start-app.mjs
set APP_ERR=%ERRORLEVEL%

echo.
if %APP_ERR% neq 0 (
  echo [ERROR] App exited with error. (exit code: %APP_ERR%)
  echo         Check the log messages above for details.
) else (
  echo [INFO] App server stopped.
)
echo.
pause

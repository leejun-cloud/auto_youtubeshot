'use strict';

/**
 * Windows launcher for C-Type Photo Reels Generator
 * Built with pkg — bundles its own Node.js just to run this script.
 * Uses runtime/node.exe (portable Node.js) for npm install & Next.js.
 */

const { spawn, spawnSync } = require('child_process');
const { createServer }     = require('net');
const path  = require('path');
const fs    = require('fs');
const util  = require('util');

// ── Project root ──────────────────────────────────────────────────────────────
// When packaged with pkg: process.execPath = start.exe → root = its directory
// When running with node: script is in scripts/ → root = one level up
const ROOT = process.pkg
  ? path.dirname(process.execPath)
  : path.resolve(__dirname, '..');

const LOG_PATH = path.join(ROOT, 'startup.log');

function appendLog(level, args) {
  try {
    const line = args.map((arg) => (
      typeof arg === 'string' ? arg : util.inspect(arg, { depth: 4, colors: false })
    )).join(' ');
    fs.appendFileSync(LOG_PATH, `[${new Date().toISOString()}] [${level}] ${line}\n`);
  } catch (_) {}
}

const originalConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

console.log = (...args) => {
  originalConsole.log(...args);
  appendLog('INFO', args);
};

console.warn = (...args) => {
  originalConsole.warn(...args);
  appendLog('WARN', args);
};

console.error = (...args) => {
  originalConsole.error(...args);
  appendLog('ERROR', args);
};

function pauseBeforeExit(code) {
  console.log();
  console.log(`[INFO] Startup log saved at: ${LOG_PATH}`);
  if (process.platform === 'win32' && process.env.YOUTUBE_SHOTS_NO_PAUSE !== '1') {
    console.log('[INFO] Press any key to close this window.');
    spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'pause'], {
      stdio: 'inherit',
      windowsHide: false,
    });
  }
  process.exit(code);
}

function fail(...messages) {
  for (const message of messages) console.error(message);
  pauseBeforeExit(1);
}

process.on('uncaughtException', (error) => {
  console.error('\n[FATAL] Uncaught exception');
  console.error(error && error.stack ? error.stack : error);
  pauseBeforeExit(1);
});

process.on('unhandledRejection', (error) => {
  console.error('\n[FATAL] Unhandled rejection');
  console.error(error && error.stack ? error.stack : error);
  pauseBeforeExit(1);
});

// ── Portable runtime paths ────────────────────────────────────────────────────
const RUNTIME  = path.join(ROOT, 'runtime');
const NODE_EXE = path.join(RUNTIME, 'node.exe');
const NPM_CMD  = path.join(RUNTIME, 'npm.cmd');
const NPM_CLI  = path.join(RUNTIME, 'node_modules', 'npm', 'bin', 'npm-cli.js');

// ── Port helpers ──────────────────────────────────────────────────────────────
const isPortFree = (port) => new Promise((resolve) => {
  const s = createServer();
  s.once('error',     () => resolve(false));
  s.once('listening', () => { s.close(); resolve(true); });
  s.listen(port);
});

const findFreePort = async (start = 3000) => {
  for (let p = start; p < start + 100; p++) {
    if (await isPortFree(p)) return p;
  }
  return start;
};

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('='.repeat(60));
  console.log('  C-Type Photo Reels Generator');
  console.log('='.repeat(60));
  console.log();

  // [0] Verify portable runtime exists
  if (!fs.existsSync(NODE_EXE) || !fs.existsSync(NPM_CMD)) {
    fail(
      '[ERROR] runtime/ folder is missing or incomplete.',
      '        Please extract the full zip file first, then run start.exe from the extracted folder.',
      `        Expected: ${NODE_EXE}`,
      `        Expected: ${NPM_CMD}`
    );
  }
  console.log('[OK] Portable Node.js found.');
  console.log(`     ${NODE_EXE}`);
  console.log();

  // [1] npm install
  console.log('[1/2] Installing dependencies...');
  console.log('      (First run may take a few minutes — please wait)');
  console.log();

  // PATH에 runtime/ 추가 → npm.cmd가 npm-cli.js 등 추가 도구 찾을 때 사용
  const env = {
    ...process.env,
    PATH: `${RUNTIME};${process.env.PATH || ''}`,
    NEXT_TELEMETRY_DISABLED: '1',
    npm_config_cache: path.join(ROOT, '.npm-cache'),
    npm_config_update_notifier: 'false',
  };

  // cmd.exe 로 "npm.cmd" 를 호출하면 Node 의 인자 재-이스케이프로 따옴표가 깨져
  // 'npm.cmd is not recognized' 오류가 난다. node.exe 로 npm-cli.js 를 직접 실행한다.
  const install = spawnSync(NODE_EXE, [NPM_CLI, 'install', '--no-audit', '--no-fund'], {
    cwd:   ROOT,
    stdio: 'inherit',
    shell: false,
    env,
  });

  if (install.status !== 0) {
    fail(
      `\n[ERROR] npm install failed (exit code: ${install.status ?? 'unknown'})`,
      '  - Check your internet connection and try again.',
      '  - If Windows Defender blocked files, allow this folder and run start.exe again.'
    );
  }
  console.log('\n[OK] Dependencies ready!\n');

  // [2] Verify next.js bin
  const NEXT_BIN = path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next');
  if (!fs.existsSync(NEXT_BIN)) {
    fail(
      '[ERROR] next.js binary not found after install.',
      '        npm install may have failed silently.',
      `        Expected: ${NEXT_BIN}`
    );
  }

  // [3] Find free port & start server
  const port = await findFreePort(3000);
  const url  = `http://localhost:${port}`;

  console.log(`[2/2] Starting app server on port ${port}...`);
  console.log('      Do NOT close this window while using the app.\n');

  const server = spawn(NODE_EXE, [NEXT_BIN, 'dev', '-p', String(port)], {
    cwd:   ROOT,
    stdio: 'inherit',
    shell: false,
    env,
  });

  server.on('error', (e) => {
    fail(`\n[ERROR] Failed to start server: ${e.message}`);
  });

  // Open browser after Next.js warms up
  setTimeout(() => {
    console.log(`\n[INFO] Opening browser: ${url}`);
    spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `start "" "${url}"`], {
      shell:    false,
      detached: true,
      stdio:    'ignore',
    }).unref();
  }, 5000);

  server.on('close', (code) => {
    console.log(`\n[INFO] Server stopped (exit code: ${code ?? 0})`);
    if ((code ?? 0) === 0) process.exit(0);
    pauseBeforeExit(code ?? 1);
  });

  process.on('SIGINT',  () => { try { server.kill('SIGINT');  } catch (_) {} process.exit(0); });
  process.on('SIGTERM', () => { try { server.kill('SIGTERM'); } catch (_) {} process.exit(0); });
}

main().catch((e) => {
  console.error('\n[FATAL]', e && e.stack ? e.stack : e);
  pauseBeforeExit(1);
});

import { spawn } from 'child_process';
import { createServer } from 'net';

// Helper to check if a port is in use
const isPortFree = (port) => {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => {
      resolve(false);
    });
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
};

// Find the first free port starting from a default
const findFreePort = async (startPort) => {
  let port = startPort;
  while (!(await isPortFree(port))) {
    console.log(`[시작기] 포트 ${port}번은 이미 사용 중입니다. 다른 포트를 찾는 중...`);
    port++;
  }
  return port;
};

const main = async () => {
  const defaultPort = 3000;
  const port = await findFreePort(defaultPort);
  const url = `http://localhost:${port}`;

  console.log(`[시작기] 포트 ${port}번에서 서버를 실행합니다...`);

  // Start Next.js on the detected free port
  const isWin = process.platform === 'win32';
  const cmd = isWin ? 'npx.cmd' : 'npx';
  const child = spawn(cmd, ['next', 'dev', '-p', String(port)], {
    stdio: 'inherit',
    shell: true,
  });

  // Wait a few seconds for Next.js to initialize, then open the browser
  setTimeout(() => {
    console.log(`[시작기] 웹 브라우저를 엽니다: ${url}`);
    try {
      if (process.platform === 'darwin') {
        spawn('open', [url]);
      } else if (process.platform === 'win32') {
        spawn('cmd', ['/c', 'start', url]);
      } else {
        spawn('xdg-open', [url]);
      }
    } catch (e) {
      console.error('[시작기] 브라우저 열기 실패:', e.message);
    }
  }, 4000);

  // Keep process alive
  process.on('SIGINT', () => {
    child.kill('SIGINT');
    process.exit();
  });

  process.on('SIGTERM', () => {
    child.kill('SIGTERM');
    process.exit();
  });
};

main().catch(console.error);

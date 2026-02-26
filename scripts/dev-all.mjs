import { spawn } from 'node:child_process';
import path from 'node:path';

const rootDir = process.cwd();
const backendDir = path.join(rootDir, 'backend');
const isWindows = process.platform === 'win32';

function run(command, args, cwd) {
  return spawn(command, args, {
    cwd,
    stdio: 'inherit',
    shell: isWindows,
  });
}

const backend = run('npm', ['start'], backendDir);
const frontend = run('npm', ['run', 'dev'], rootDir);

let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  if (!backend.killed) {
    backend.kill('SIGTERM');
  }

  if (!frontend.killed) {
    frontend.kill('SIGTERM');
  }

  setTimeout(() => {
    process.exit(code);
  }, 200).unref();
}

backend.on('exit', (code) => {
  if (shuttingDown) return;
  shutdown(code ?? 0);
});

frontend.on('exit', (code) => {
  if (shuttingDown) return;
  shutdown(code ?? 0);
});

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

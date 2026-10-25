// pnpm dev: сервер харнесса и Vite вместе, в одном терминале.
// Интерфейс — http://127.0.0.1:5173, запросы к /api Vite передаёт серверу (packages/ui/vite.config.ts).
// Ctrl+C получают оба процесса; закончился один — останавливаем и второй.

import { spawn } from 'node:child_process';

const processes = [
  spawn('node', ['packages/server/dist/main.js'], { stdio: 'inherit' }),
  spawn('pnpm', ['--filter', '@harness-visualization/ui', 'exec', 'vite'], {
    stdio: 'inherit',
    // На Windows pnpm — это pnpm.cmd, без оболочки его не запустить.
    shell: process.platform === 'win32',
  }),
];

for (const child of processes) {
  child.on('exit', (code) => {
    for (const other of processes) {
      if (other !== child && other.exitCode === null) {
        other.kill('SIGINT');
      }
    }
    process.exitCode = code ?? 0;
  });
}

// Запуск кода Код-арены (этап 10): отдельный процесс Node под моделью разрешений.
// Им пользуются run_tests (node --test) и run_node (node <файл>) — код в обоих написала модель.
//   - --permission: читать и писать можно только в папке проекта; запускать другие программы,
//     воркеры и аддоны нельзя; где Node умеет (флаг --allow-net, с Node 25), закрыта и сеть;
//   - окружение пустое, кроме PATH: ключей DeepSeek и Tavily процессу не видно;
//   - таймаут: зависший код не держит сессию.
// Сама документация Node называет это «ремнём безопасности»: от ошибок, а не от злоумышленника
// (https://nodejs.org/api/permissions.html).

import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

export interface SandboxRun {
  // Вывод stdout и stderr вперемешку, пути — от корня проекта.
  output: string;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
}

// С Node 25 модель разрешений закрывает и сеть — тогда Node знает флаг --allow-net.
export function networkClosedByPermissions(): boolean {
  return process.allowedNodeEnvironmentFlags.has('--allow-net');
}

export function nodeMajor(): number {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 22) {
    throw new Error(`Для Код-арены нужен Node 22 или новее, сейчас ${process.versions.node}`);
  }
  return major;
}

export function permissionArguments(directory: string): string[] {
  const root = resolve(directory);
  return ['--permission', `--allow-fs-read=${root}`, `--allow-fs-write=${root}`];
}

export function runSandboxedNode(request: {
  directory: string;
  args: readonly string[];
  timeoutMs: number;
}): Promise<SandboxRun> {
  const started = Date.now();
  return new Promise((done, fail) => {
    const child = spawn(
      process.execPath,
      [...permissionArguments(request.directory), ...request.args],
      {
        cwd: request.directory,
        env: { PATH: process.env.PATH ?? '' },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let output = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, request.timeoutMs);
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString('utf8')));
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString('utf8')));
    child.on('error', (error) => {
      clearTimeout(timer);
      fail(error);
    });
    child.on('close', (exitCode) => {
      clearTimeout(timer);
      done({
        output: maskRoot(output, request.directory),
        exitCode,
        timedOut,
        durationMs: Date.now() - started,
      });
    });
  });
}

// Пути в выводе — от корня проекта: полный путь выдаёт имя пользователя и не нужен модели.
function maskRoot(output: string, directory: string): string {
  const root = resolve(directory);
  return output.replaceAll(`file://${root}`, '.').replaceAll(root, '.');
}

export function truncate(text: string, limit: number): string {
  return text.length <= limit
    ? text
    : `${text.slice(0, limit)}\n[вывод обрезан: ${String(text.length)} символов]`;
}

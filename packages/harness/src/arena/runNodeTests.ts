// Запуск тестов Код-арены (этап 10): node --test в копии проекта под моделью разрешений Node.
//
// Тесты исполняют код, который написала модель, поэтому:
//   - --permission: читать и писать можно только в папке копии, запускать другие программы,
//     воркеры и аддоны нельзя; где Node умеет (флаг --allow-net), закрыта и сеть;
//   - окружение пустое, кроме PATH: ключей DeepSeek и Tavily тестам не видно;
//   - таймаут: зависший тест не держит сессию.
// Сама документация Node называет это «ремнём безопасности»: от ошибок, а не от злоумышленника
// (https://nodejs.org/api/permissions.html).

import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { parseTap, type NodeTestResult } from './testResults.js';

export interface NodeTestRequest {
  directory: string;
  // Что запускать: по умолчанию все тесты node --test (test/, *.test.js и т. п.).
  patterns: string[];
  timeoutMs: number;
  outputMaxCharacters: number;
}

// С Node 25 модель разрешений закрывает и сеть — тогда Node знает флаг --allow-net.
export function networkClosedByPermissions(): boolean {
  return process.allowedNodeEnvironmentFlags.has('--allow-net');
}

export function nodeTestArguments(directory: string, patterns: readonly string[]): string[] {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 22) {
    throw new Error(`Для Код-арены нужен Node 22 или новее, сейчас ${process.versions.node}`);
  }
  // Один процесс на все файлы: отдельный процесс на файл модель разрешений запретила бы.
  const isolation = major >= 24 ? '--test-isolation=none' : '--experimental-test-isolation=none';
  const root = resolve(directory);
  return [
    '--permission',
    `--allow-fs-read=${root}`,
    `--allow-fs-write=${root}`,
    '--test',
    isolation,
    '--test-reporter=tap',
    ...patterns,
  ];
}

export async function runNodeTests(request: NodeTestRequest): Promise<NodeTestResult> {
  const started = Date.now();
  const raw = await spawnNode(request);
  // Пути в выводе — от корня копии: полный путь выдаёт имя пользователя и не нужен модели.
  const output = raw.output
    .replaceAll(`file://${resolve(request.directory)}`, '.')
    .replaceAll(resolve(request.directory), '.');
  const { timedOut } = raw;
  const tests = parseTap(output);
  return {
    passed: tests.filter((test) => test.ok).length,
    failed: tests.filter((test) => !test.ok).length,
    tests,
    output: truncate(output, request.outputMaxCharacters),
    durationMs: Date.now() - started,
    timedOut,
    network: networkClosedByPermissions() ? 'closed' : 'open',
    nodeVersion: process.versions.node,
  };
}

function spawnNode(request: NodeTestRequest): Promise<{ output: string; timedOut: boolean }> {
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, nodeTestArguments(request.directory, request.patterns), {
      cwd: request.directory,
      env: { PATH: process.env.PATH ?? '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
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
    child.on('close', () => {
      clearTimeout(timer);
      done({ output, timedOut });
    });
  });
}

function truncate(text: string, limit: number): string {
  return text.length <= limit
    ? text
    : `${text.slice(0, limit)}\n[вывод обрезан: ${String(text.length)} символов]`;
}

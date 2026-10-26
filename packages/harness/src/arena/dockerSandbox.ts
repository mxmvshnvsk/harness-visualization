// Запуск кода Код-арены в контейнере Docker — вариант песочницы (arena.sandbox: "docker").
// Модель разрешений Node — «ремень безопасности»: от ошибок, а не от злоумышленника, и сеть
// она закрывает только с Node 25. Контейнер — граница крепче:
//   - сети нет совсем (--network none) при любой версии Node;
//   - видна только папка копии проекта, смонтированная как /work; остальная файловая
//     система контейнера — только для чтения, /tmp — в памяти;
//   - лимиты памяти, процессора и числа процессов: бесконечный цикл или fork-бомба
//     не положат машину;
//   - без привилегий: все capabilities сброшены, повысить права нельзя; процесс работает
//     от имени вашего пользователя, поэтому файлы в копии остаются вашими.
// Цена — время: запуск контейнера добавляет к каждому прогону около секунды, а образ
// с Node нужно один раз скачать (docker pull).
// Так же изолируют код агентов OpenAI Codex и Claude Code в облаке; см. docs/help/code-arena.md.

import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import type { ArenaSettings } from '../settings/settingsSchema.js';
import type { SandboxRun } from './nodeSandbox.js';

const execFileAsync = promisify(execFile);

// Папка копии внутри контейнера: в выводе пути — от неё, а не от вашей домашней папки.
const WORK = '/work';

export type DockerSettings = ArenaSettings['docker'];

export function dockerArguments(
  docker: DockerSettings,
  request: { directory: string; name: string; args: readonly string[] },
): string[] {
  return [
    'run',
    '--rm',
    '--name',
    request.name,
    '--network',
    'none',
    '--read-only',
    '--tmpfs',
    '/tmp',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '--memory',
    docker.memory,
    '--cpus',
    String(docker.cpus),
    '--pids-limit',
    String(docker.pidsLimit),
    ...userArguments(),
    '--volume',
    `${resolve(request.directory)}:${WORK}`,
    '--workdir',
    WORK,
    docker.image,
    'node',
    ...request.args,
  ];
}

// От имени вашего пользователя — там, где у процесса есть uid (не Windows).
function userArguments(): string[] {
  const uid = process.getuid?.();
  const gid = process.getgid?.();
  return uid === undefined || gid === undefined ? [] : ['--user', `${String(uid)}:${String(gid)}`];
}

const versions = new Map<string, Promise<string>>();

// Версия Node в образе — один раз на образ: от неё зависят флаги node --test.
export function dockerNodeVersion(docker: DockerSettings): Promise<string> {
  const cached = versions.get(docker.image);
  if (cached !== undefined) {
    return cached;
  }
  const version = execFileAsync('docker', ['run', '--rm', docker.image, 'node', '--version'], {
    timeout: 120_000,
  }).then(
    ({ stdout }) => stdout.trim().replace(/^v/, ''),
    (error: unknown) => {
      versions.delete(docker.image);
      throw dockerError(error, docker.image);
    },
  );
  versions.set(docker.image, version);
  return version;
}

export function runInDocker(
  docker: DockerSettings,
  request: { directory: string; args: readonly string[]; timeoutMs: number },
): Promise<SandboxRun> {
  const started = Date.now();
  const name = `hv-arena-${randomUUID().slice(0, 8)}`;
  return new Promise((done, fail) => {
    const child = spawn('docker', dockerArguments(docker, { ...request, name }), {
      env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    let timedOut = false;
    // Убить нужно контейнер, а не клиент docker: иначе код в контейнере продолжит работать.
    const timer = setTimeout(() => {
      timedOut = true;
      execFile('docker', ['kill', name], () => child.kill('SIGKILL'));
    }, request.timeoutMs);
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString('utf8')));
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString('utf8')));
    child.on('error', (error) => {
      clearTimeout(timer);
      fail(dockerError(error, docker.image));
    });
    child.on('close', (exitCode) => {
      clearTimeout(timer);
      done({
        output: output.replaceAll(`file://${WORK}`, '.').replaceAll(WORK, '.'),
        exitCode,
        timedOut,
        durationMs: Date.now() - started,
      });
    });
  });
}

function dockerError(error: unknown, image: string): Error {
  const text = error instanceof Error ? error.message : String(error);
  if (text.includes('ENOENT')) {
    return new Error(
      'Docker не найден. Установите Docker или верните в harness.config.json arena.sandbox: "node".',
    );
  }
  return new Error(
    `Docker не запустил образ ${image}: ${text}. Запущен ли Docker? Скачан ли образ (docker pull ${image})?`,
  );
}

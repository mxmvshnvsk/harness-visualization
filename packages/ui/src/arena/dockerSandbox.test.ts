import { describe, expect, it } from 'vitest';
import { dockerArguments } from '@harness-visualization/harness/arena/docker';

// Песочница Docker (arena.sandbox: "docker"): что именно харнесс просит у docker run.
// Сам запуск проверен на стенде: сеть недоступна (EAI_AGAIN), запись в /etc — EROFS,
// бесконечный цикл остановлен по таймауту вместе с контейнером.
const docker = { image: 'node:24-alpine', memory: '512m', cpus: 1, pidsLimit: 256 };

describe('docker run для кода агента', () => {
  const args = dockerArguments(docker, {
    directory: '/home/alice/hv/workspace-arena/copy',
    name: 'hv-arena-test',
    args: ['--', 'scripts/check.mjs'],
  });
  const joined = args.join(' ');

  it('без сети, файловая система только для чтения, без привилегий', () => {
    expect(joined).toContain('--network none');
    expect(joined).toContain('--read-only');
    expect(joined).toContain('--cap-drop ALL');
    expect(joined).toContain('--security-opt no-new-privileges');
  });

  it('лимиты памяти, процессора и процессов — из настроек', () => {
    expect(joined).toContain('--memory 512m');
    expect(joined).toContain('--cpus 1');
    expect(joined).toContain('--pids-limit 256');
  });

  it('видна только копия проекта, как /work; дальше — образ и node с аргументами', () => {
    expect(joined).toContain('--volume /home/alice/hv/workspace-arena/copy:/work');
    expect(joined).toContain('--workdir /work');
    expect(args.slice(-4)).toEqual(['node:24-alpine', 'node', '--', 'scripts/check.mjs']);
  });
});

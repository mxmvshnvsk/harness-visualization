// Прогон Код-арены как сессия харнесса (этап 10): копия проекта — рабочая папка агента,
// тулы — файлы и run_tests, свой system prompt, после ответа — приёмка.

import { mkdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import type { ArenaRun } from '../events/harnessEvents.js';
import type { ArenaSettings } from '../settings/settingsSchema.js';
import { readArenaTask, type ArenaTaskDetails } from './arenaTasks.js';
import { prepareArenaCopy, readTestFiles } from './prepareArenaCopy.js';
import { networkClosedByPermissions } from './runNodeTests.js';

export interface ArenaSessionInput {
  // null — свободный режим (этап 10.4).
  task: ArenaTaskDetails | null;
  // Абсолютный путь копии.
  directory: string;
  // false — режим «вслепую»: без run_tests.
  runTests: boolean;
  // Видимые тесты до работы агента: путь → текст. Их и запускает приёмка.
  originalTests: Record<string, string>;
}

export interface ArenaRunRequest {
  projectRoot: string;
  settings: ArenaSettings;
  taskId: string;
  runTests: boolean;
  // Наложить эталонное решение (pnpm arena --verify).
  withSolution?: boolean;
}

// Новая копия на каждый прогон: попытки не должны видеть работу друг друга.
export async function prepareArenaRun(request: ArenaRunRequest): Promise<ArenaSessionInput> {
  const arenaRoot = resolve(request.projectRoot, request.settings.directory);
  const task = await readArenaTask(arenaRoot, request.taskId);
  const stamp = new Date().toISOString().slice(0, 19).replaceAll(':', '-');
  const suffix = Math.random().toString(36).slice(2, 6);
  const directory = resolve(
    request.projectRoot,
    request.settings.workspaceDirectory,
    `${stamp}_${task.id}_${suffix}`,
  );
  await mkdir(directory, { recursive: true });
  await prepareArenaCopy({
    projectRoot: request.projectRoot,
    arenaRoot,
    taskId: task.id,
    directory,
    withSolution: request.withSolution ?? false,
  });
  return {
    task,
    directory,
    runTests: request.runTests,
    originalTests: await readTestFiles(directory),
  };
}

export function describeArenaRun(arena: ArenaSessionInput, projectRoot: string): ArenaRun {
  return {
    taskId: arena.task?.id ?? null,
    directory: relative(projectRoot, arena.directory).split('\\').join('/'),
    runTests: arena.runTests,
    network: networkClosedByPermissions() ? 'closed' : 'open',
    nodeVersion: process.versions.node,
  };
}

// System prompt арены: ни «Кедр Софт» как компании ассистента, ни базы знаний — проект
// и задача. О скрытых тестах модель не знает: как разработчик, которому не показали приёмку.
export function buildArenaSystemPrompt(toolNames: readonly string[]): string {
  return [
    'Ты — разработчик. Отвечай на языке пользователя, кратко.',
    'Рабочая папка — копия проекта на JavaScript: Node, без зависимостей, только встроенные модули.',
    'Задача — в TASK.md, описание проекта — в README.md, тексты регламентов — в docs/regulations/.',
    'Читай и меняй файлы тулами; пути — от корня рабочей папки.',
    toolNames.includes('run_tests')
      ? 'Тесты проекта запускает тул run_tests (node --test).'
      : 'Запускать код и тесты нельзя: такого тула нет.',
    'Когда закончишь, кратко скажи, что сделал.',
  ].join('\n');
}

export function arenaRoot(projectRoot: string, settings: ArenaSettings): string {
  return join(resolve(projectRoot), settings.directory);
}

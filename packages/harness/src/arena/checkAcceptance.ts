// Приёмка (этап 10): когда агент ответил, харнесс сам проверяет работу. Агенту не верим
// на слово: его «тесты проходят» — это его тесты.
//   1. видимые тесты не изменены (кроме editableTests задачи) — иначе «подогнал тесты»;
//   2. видимые и скрытые тесты зелёные.
// Скрытые тесты запускаются в отдельной копии работы агента — его папку не трогаем.

import { cp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { AcceptanceCheckedPayload } from '../events/harnessEvents.js';
import type { ArenaSettings } from '../settings/settingsSchema.js';
import { tasksDirectory, type ArenaTask } from './arenaTasks.js';
import { fingerprintTests } from './prepareArenaCopy.js';
import { runNodeTests } from './runNodeTests.js';
import type { NodeTestCase, NodeTestResult } from './testResults.js';

export interface AcceptanceRequest {
  arenaRoot: string;
  task: ArenaTask;
  // Папка, где работал агент.
  directory: string;
  // Отпечатки видимых тестов до работы агента.
  testFingerprints: Record<string, string>;
  settings: ArenaSettings;
}

export async function checkAcceptance(
  request: AcceptanceRequest,
): Promise<AcceptanceCheckedPayload> {
  const changedTests = await changedProtectedTests(request);
  const checkDirectory = `${request.directory}.acceptance`;
  await rm(checkDirectory, { recursive: true, force: true });
  await mkdir(checkDirectory, { recursive: true });
  await cp(request.directory, checkDirectory, { recursive: true });
  await cp(
    join(tasksDirectory(request.arenaRoot), request.task.id, 'acceptance'),
    join(checkDirectory, 'acceptance'),
    {
      recursive: true,
    },
  );
  // Два запуска: у прошедших тестов TAP не пишет файл, и по одному выводу видимые от скрытых
  // не отличить.
  const runs = { directory: checkDirectory, settings: request.settings };
  const visibleRun = await runPatterns(runs, 'test/**/*.test.js');
  const hiddenRun = await runPatterns(runs, 'acceptance/**/*.test.js');
  await rm(checkDirectory, { recursive: true, force: true });
  const visible = visibleRun.tests;
  const hidden = hiddenRun.tests;
  const timedOut = visibleRun.timedOut || hiddenRun.timedOut;
  return {
    type: 'acceptance_checked',
    taskId: request.task.id,
    passed:
      changedTests.length === 0 &&
      !timedOut &&
      hidden.length > 0 &&
      [...visible, ...hidden].every((test) => test.ok),
    visible: { passed: count(visible, true), failed: count(visible, false) },
    hidden: { passed: count(hidden, true), failed: count(hidden, false), tests: hidden },
    changedTests,
    timedOut,
    durationMs: visibleRun.durationMs + hiddenRun.durationMs,
    output: hiddenRun.output,
  };
}

function runPatterns(
  run: { directory: string; settings: ArenaSettings },
  pattern: string,
): Promise<NodeTestResult> {
  return runNodeTests({
    directory: run.directory,
    patterns: [pattern],
    timeoutMs: run.settings.testTimeoutSeconds * 1000,
    outputMaxCharacters: run.settings.outputMaxCharacters,
  });
}

function count(tests: readonly NodeTestCase[], ok: boolean): number {
  return tests.filter((test) => test.ok === ok).length;
}

async function changedProtectedTests(request: AcceptanceRequest): Promise<string[]> {
  const now = await fingerprintTests(request.directory);
  const editable = new Set(request.task.editableTests);
  // Новые тесты агента — не подгонка: сверяем только те, что были до него.
  return Object.keys(request.testFingerprints)
    .filter((path) => !editable.has(path) && request.testFingerprints[path] !== now[path])
    .sort();
}

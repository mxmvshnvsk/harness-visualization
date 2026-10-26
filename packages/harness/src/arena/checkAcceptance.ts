// Приёмка (этап 10): когда агент ответил, харнесс сам проверяет работу. Агенту не верим
// на слово: его «тесты проходят» — это его тесты.
//   1. исходные видимые тесты — такие, какими они были до агента (кроме editableTests задачи:
//      их агенту можно и нужно править), — зелёные на его коде;
//   2. скрытые тесты зелёные.
// Агент может дописывать тесты — это не подгонка. Подгонка — ослабить исходные, и её ловит
// пункт 1: запускаются не его правки, а исходники. Сначала было иначе — правка файла теста
// сама по себе проваливала приёмку, и на первом прогоне автора (trip-deadline, 26.10.2026)
// приёмка отвергла верное решение: агент дописал в test/tripReport.test.js свои краевые тесты.
// Всё запускается в отдельной копии работы агента — его папку не трогаем.

import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { AcceptanceCheckedPayload } from '../events/harnessEvents.js';
import type { ArenaSettings } from '../settings/settingsSchema.js';
import { tasksDirectory, type ArenaTask } from './arenaTasks.js';
import { readTestFiles } from './prepareArenaCopy.js';
import { runNodeTests } from './runNodeTests.js';
import type { NodeTestCase, NodeTestResult } from './testResults.js';

export interface AcceptanceRequest {
  arenaRoot: string;
  task: ArenaTask;
  // Папка, где работал агент.
  directory: string;
  // Видимые тесты до работы агента: путь → текст.
  originalTests: Record<string, string>;
  settings: ArenaSettings;
}

export async function checkAcceptance(
  request: AcceptanceRequest,
): Promise<AcceptanceCheckedPayload> {
  const checkDirectory = `${request.directory}.acceptance`;
  await rm(checkDirectory, { recursive: true, force: true });
  await mkdir(checkDirectory, { recursive: true });
  await cp(request.directory, checkDirectory, { recursive: true });
  const changedTests = await restoreOriginalTests(request, checkDirectory);
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
    passed: !timedOut && hidden.length > 0 && [...visible, ...hidden].every((test) => test.ok),
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

// Кладёт исходные видимые тесты поверх правок агента (кроме editableTests) и отвечает, какие
// из них агент менял или удалял, — для отчёта, на итог это не влияет.
async function restoreOriginalTests(
  request: AcceptanceRequest,
  checkDirectory: string,
): Promise<string[]> {
  const editable = new Set(request.task.editableTests);
  const now = await readTestFiles(request.directory);
  const changed: string[] = [];
  for (const [path, text] of Object.entries(request.originalTests)) {
    if (now[path] !== text) {
      changed.push(path);
    }
    if (!editable.has(path)) {
      await mkdir(dirname(join(checkDirectory, path)), { recursive: true });
      await writeFile(join(checkDirectory, path), text, 'utf8');
    }
  }
  return changed.sort();
}

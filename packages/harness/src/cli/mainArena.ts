// Точка входа pnpm arena (этап 10): Код-арена из терминала.
//   pnpm arena --list                           — задачи
//   pnpm arena --task trip-deadline             — прогон: агент в копии проекта, потом приёмка
//   pnpm arena --task trip-deadline --blind     — «вслепую»: без run_tests
//   pnpm arena --task refactor --context demo --max-steps 10
//                                               — «харнесс зажат»: контекст и шаги как у demo
//   pnpm arena --verify                         — у каждой задачи заготовка не проходит
//                                                 приёмку, а эталонное решение проходит

import { rm } from 'node:fs/promises';
import { parseArgs, styleText } from 'node:util';
import { listArenaTasks, readArenaTask } from '../arena/arenaTasks.js';
import { arenaRoot, prepareArenaRun } from '../arena/arenaSession.js';
import { arenaSessionInput } from '../arena/arenaSessionInput.js';
import { checkAcceptance } from '../arena/checkAcceptance.js';
import { REASONING_EFFORTS, type ReasoningEffort } from '../model/chatTypes.js';
import { loadSettings, readConfigFile, type LoadedSettings } from '../settings/loadSettings.js';
import type { ArenaSettings, ContextPreset } from '../settings/settingsSchema.js';
import { runCliSession } from './runCliSession.js';

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      list: { type: 'boolean', default: false },
      verify: { type: 'boolean', default: false },
      task: { type: 'string' },
      blind: { type: 'boolean', default: false },
      effort: { type: 'string' },
      context: { type: 'string' },
      'max-steps': { type: 'string' },
    },
  });
  const projectRoot = process.cwd();
  // Списку задач и проверке задач ключ модели не нужен: только harness.config.json.
  const { arena: arenaSettings } = await readConfigFile(projectRoot);
  if (values.verify) {
    process.exitCode = (await verifyTasks(arenaSettings, projectRoot, values.task)) ? 0 : 1;
    return;
  }
  if (values.list || values.task === undefined) {
    await printTasks(arenaSettings, projectRoot);
    return;
  }
  const loadedSettings = await loadSettings(projectRoot);
  const arena = await prepareArenaRun({
    projectRoot,
    settings: loadedSettings.settings.arena,
    taskId: values.task,
    runTests: !values.blind,
    // В терминале есть кого спросить: каждый запуск run_node харнесс подтверждает у вас.
    runNode: true,
    contextPreset: parsePreset(values.context),
    maxIterations: parseSteps(values['max-steps']),
  });
  const result = await runCliSession({
    ...arenaSessionInput({
      loadedSettings,
      projectRoot,
      arena,
      reasoningEffort: parseEffort(values.effort, loadedSettings),
      question: null,
    }),
    verbose: false,
    quiet: false,
  });
  console.log(styleText('dim', `Копия проекта: ${arena.directory}`));
  if (result.failed) {
    process.exitCode = 1;
  }
}

function parsePreset(value: string | undefined): ContextPreset | null {
  if (value === undefined) {
    return null;
  }
  if (value !== 'demo' && value !== 'stress' && value !== 'real') {
    throw new Error('--context: одно из demo, stress, real');
  }
  return value;
}

function parseSteps(value: string | undefined): number | null {
  if (value === undefined) {
    return null;
  }
  const steps = Number(value);
  if (!Number.isInteger(steps) || steps < 1) {
    throw new Error('--max-steps: целое число больше нуля');
  }
  return steps;
}

function parseEffort(value: string | undefined, loadedSettings: LoadedSettings): ReasoningEffort {
  if (value === undefined) {
    return loadedSettings.settings.model.defaultReasoningEffort;
  }
  if (!(REASONING_EFFORTS as readonly string[]).includes(value)) {
    throw new Error(`--effort: одно из ${REASONING_EFFORTS.join(', ')}`);
  }
  return value as ReasoningEffort;
}

async function printTasks(settings: ArenaSettings, projectRoot: string): Promise<void> {
  const root = arenaRoot(projectRoot, settings);
  for (const task of await listArenaTasks(root)) {
    console.log(`${styleText('bold', task.id)} · ${task.kind} · ${task.title}`);
    console.log(styleText('dim', `   ${task.summary}`));
  }
}

// Проверка самих задач, без модели: заготовка должна проваливать приёмку, эталон — проходить.
// Иначе задача врёт — либо её нечего решать, либо скрытые тесты непроходимы.
async function verifyTasks(
  settings: ArenaSettings,
  projectRoot: string,
  only: string | undefined,
): Promise<boolean> {
  const root = arenaRoot(projectRoot, settings);
  const tasks = only === undefined ? await listArenaTasks(root) : [await readArenaTask(root, only)];
  let allGood = true;
  for (const task of tasks) {
    const blank = await acceptanceOf(settings, projectRoot, task.id, false);
    const solved = await acceptanceOf(settings, projectRoot, task.id, true);
    const good = !blank && solved;
    allGood &&= good;
    console.log(
      `${good ? styleText('green', '✓') : styleText('red', '✗')} ${task.id}: заготовка ${blank ? 'проходит (плохо)' : 'не проходит'}, эталон ${solved ? 'проходит' : 'не проходит (плохо)'}`,
    );
  }
  return allGood;
}

async function acceptanceOf(
  settings: ArenaSettings,
  projectRoot: string,
  taskId: string,
  withSolution: boolean,
): Promise<boolean> {
  const run = await prepareArenaRun({
    projectRoot,
    settings,
    taskId,
    runTests: true,
    withSolution,
  });
  const task = run.task;
  if (task === null) {
    throw new Error(`Нет задачи ${taskId}`);
  }
  // Исходные тесты — из заготовки: эталон wrong-test правит тест, как и должен агент.
  const blank = withSolution
    ? await prepareArenaRun({ projectRoot, settings, taskId, runTests: true })
    : run;
  const result = await checkAcceptance({
    arenaRoot: arenaRoot(projectRoot, settings),
    task,
    directory: run.directory,
    originalTests: blank.originalTests,
    originalFiles: null,
    settings,
  });
  await rm(run.directory, { recursive: true, force: true });
  if (blank !== run) {
    await rm(blank.directory, { recursive: true, force: true });
  }
  return result.passed;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

// Точка входа pnpm branch (этап 9): ветка от шага записанной сессии.
//   pnpm branch traces/…jsonl --list                       — шаги и результаты тулов, которые можно подменить
//   pnpm branch traces/…jsonl --step 4                     — переиграть шаг 4 как есть
//   pnpm branch traces/…jsonl --step 4 --tool-call ID --content "Документ не найден."
//                                                          — подменить результат тула перед шагом 4
// Шаги до точки ветвления — replay из трейса (без запросов и тулов), с неё — новый прогон
// со своим трейсом, где событие branch_started ссылается на исходный.

import { readFile } from 'node:fs/promises';
import { parseArgs, styleText } from 'node:util';
import { listBranchSteps, type BranchEdit } from '../branch/branchPoint.js';
import { branchSessionInput } from '../branch/branchInput.js';
import { readTrace } from '../grounding/readTrace.js';
import { loadSettings } from '../settings/loadSettings.js';
import { runCliSession } from './runCliSession.js';

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      list: { type: 'boolean', default: false },
      step: { type: 'string' },
      'tool-call': { type: 'string' },
      content: { type: 'string' },
      'content-file': { type: 'string' },
    },
  });
  const tracePath = positionals[0];
  if (tracePath === undefined) {
    throw new Error('Укажите трейс: pnpm branch traces/<файл>.jsonl --list');
  }
  const events = await readTrace(tracePath);
  if (values.list || values.step === undefined) {
    printSteps(events);
    return;
  }
  const projectRoot = process.cwd();
  const input = branchSessionInput({
    loadedSettings: await loadSettings(projectRoot),
    projectRoot,
    sourceTracePath: tracePath,
    sourceEvents: events,
    step: Number(values.step),
    edit: await readEdit(values['tool-call'], values.content, values['content-file']),
    workspaceDirectory: null,
  });
  const result = await runCliSession({ ...input, verbose: false, quiet: false });
  if (result.failed) {
    process.exitCode = 1;
  }
}

async function readEdit(
  toolCallId: string | undefined,
  content: string | undefined,
  contentFile: string | undefined,
): Promise<BranchEdit> {
  if (toolCallId === undefined) {
    return { kind: 'replay' };
  }
  const text = contentFile === undefined ? content : await readFile(contentFile, 'utf8');
  if (text === undefined) {
    throw new Error('--tool-call без нового результата: добавьте --content или --content-file');
  }
  return { kind: 'toolResult', toolCallId, content: text };
}

function printSteps(events: Awaited<ReturnType<typeof readTrace>>): void {
  for (const step of listBranchSteps(events)) {
    console.log(styleText('bold', `шаг ${String(step.step)} · «${step.question}»`));
    for (const result of step.toolResults) {
      const preview = result.content.replaceAll('\n', ' ').slice(0, 70);
      console.log(styleText('dim', `   ${result.toolCallId} ${result.toolName}: ${preview}`));
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

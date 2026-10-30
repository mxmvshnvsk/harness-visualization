// Точка входа pnpm eval (этап 8e): набор задач из evals/, k попыток каждой задачи в каждой
// конфигурации, проверки кодом по трейсу и судья по рубрике, итоги pass@k и pass^k.
//   pnpm eval                              — evals/kedr.json, конфигурации tool и auto, по 3 попытки
//   pnpm eval --trials 5                   — по 5 попыток
//   pnpm eval --configs tool,auto,rewrite  — конфигурации из compare-runs
//   pnpm eval --task vacation-days         — только эти задачи (через запятую)
//   pnpm eval --suite capability           — только трудные задачи (или regression)
//   pnpm eval --models default,glm-4.6 --configs tool — сравнить модели на одном харнессе
//   pnpm eval --model qwen-local --no-judge          — одна модель без ключа DeepSeek
//   pnpm eval --judge-model default                 — отдельная фиксированная модель судьи
//   pnpm eval --effort high                         — общий effort, без молчаливого понижения
//   pnpm eval --no-judge                   — без судьи: только проверки кодом, без лишних денег
//   pnpm eval --set evals/arena.json       — задачи Код-арены (этап 10.3); конфигурации — режимы
//                                            арены: blind, tests (по умолчанию), tests-max, squeezed
//
// Каждая попытка — обычная сессия со своим трейсом в traces/ и своей временной рабочей
// папкой из примеров. Конфигурации чередуются внутри попытки. Разные модели и провайдеры
// имеют отдельные кэши prompt; чередование не делает их одинаково прогретыми. Отчёт — JSON в traces/evals/.

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { parseArgs, styleText } from 'node:util';
import { readTrace } from '../grounding/readTrace.js';
import { prepareArenaRun } from '../arena/arenaSession.js';
import { arenaSessionInput } from '../arena/arenaSessionInput.js';
import {
  prepareEvalModels,
  resolveEvalVariants,
  selectEvalModel,
  parseEvalModelKeys,
  type EvalExecutionConfig,
} from '../evals/evalExecutionPlan.js';
import { evalConfigModelLabel, evalReportModelLabel, type EvalModel } from '../evals/evalModels.js';
import { REASONING_EFFORTS, type ReasoningEffort } from '../model/chatTypes.js';
import { validateModelEffort } from '../settings/selectSessionModel.js';
import { readFirstRequestCache } from '../runComparison/summarizeRun.js';
import { readTrialFacts, runCodeCheck, type CheckResult } from '../evals/codeChecks.js';
import {
  EVAL_REPORT_VERSION,
  trialPassed,
  type EvalReport,
  type TrialResult,
} from '../evals/evalReport.js';
import {
  EVAL_SUITES,
  evalSetSchema,
  type EvalSet,
  type EvalSuite,
  type EvalTask,
} from '../evals/evalSet.js';
import { markOf, printEvalSummary } from '../evals/printEvalSummary.js';
import { startEvalJudge, type EvalJudge } from '../evals/judgeAnswers.js';
import type { HarnessEvent } from '../events/harnessEvents.js';
import { loadSettings, type LoadedSettings } from '../settings/loadSettings.js';
import { runCliSession } from './runCliSession.js';
import { formatFixed } from '../events/formatForConsole.js';

const DEFAULT_SET = 'evals/kedr.json';
const DEFAULT_TRIALS = 3;
const MAX_TRIALS = 10;

interface EvalOptions {
  setFile: string;
  trials: number;
  // null — конфигурации по умолчанию для вида набора.
  configNames: string[] | null;
  taskIds: string[] | null;
  suite: EvalSuite | null;
  judge: boolean;
  modelKeys: string[] | null;
  judgeModelKey: string;
  reasoningEffort?: ReasoningEffort;
}

interface EvalContext {
  loadedSettings: LoadedSettings;
  projectRoot: string;
  temporaryRoot: string;
  judge: EvalJudge | null;
  report: EvalReport;
  reportPath: string;
  total: number;
  configs: EvalExecutionConfig[];
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const projectRoot = process.cwd();
  const loadedSettings = await loadSettings(projectRoot, { requireModelKey: false });
  const set = await readSet(join(projectRoot, options.setFile));
  const variants = resolveEvalVariants(set, options.configNames);
  const configs = await prepareEvalModels({
    loadedSettings,
    configs: variants,
    modelKeys: options.modelKeys,
    reasoningEffort: options.reasoningEffort,
  });
  const tasks = pickTasks(set, options.taskIds).filter(
    (task) => options.suite === null || task.suite === options.suite,
  );
  const context = await createContext({
    options,
    set,
    tasks,
    configs,
    loadedSettings,
    projectRoot,
  });
  printIntroduction(context);
  try {
    for (const { task, config, trial } of planTrials(options.trials, tasks, configs)) {
      context.report.results.push(await runTrial(task, config, trial, context));
      // Отчёт пишется после каждой попытки: прерванный прогон не пропадает.
      await saveReport(context);
    }
  } finally {
    await rm(context.temporaryRoot, { recursive: true, force: true });
    context.report.judgeTracePath = context.judge === null ? null : await context.judge.finish();
    context.report.finishedAt = new Date().toISOString();
    await saveReport(context);
  }
  printEvalSummary(context.report);
  console.log(styleText('dim', `\nОтчёт: ${context.reportPath}`));
}

// Порядок попыток: сначала первая попытка всех задач во всех конфигурациях, потом вторая…
// Чередование уменьшает влияние порядка; общий кэш возможен только у одной модели и API.
function planTrials(
  trials: number,
  tasks: EvalTask[],
  configs: EvalExecutionConfig[],
): { task: EvalTask; config: EvalExecutionConfig; trial: number }[] {
  const plan = [];
  for (let trial = 1; trial <= trials; trial += 1) {
    for (const task of tasks) {
      plan.push(...configs.map((config) => ({ task, config, trial })));
    }
  }
  return plan;
}

function parseOptions(argumentList: string[]): EvalOptions {
  const { values } = parseArgs({
    args: argumentList,
    options: {
      set: { type: 'string' },
      trials: { type: 'string' },
      configs: { type: 'string' },
      task: { type: 'string' },
      suite: { type: 'string' },
      models: { type: 'string' },
      model: { type: 'string' },
      effort: { type: 'string' },
      'judge-model': { type: 'string' },
      'no-judge': { type: 'boolean', default: false },
    },
  });
  const trials = values.trials === undefined ? DEFAULT_TRIALS : Number(values.trials);
  if (!Number.isInteger(trials) || trials < 1 || trials > MAX_TRIALS) {
    throw new Error(`--trials: целое число от 1 до ${String(MAX_TRIALS)}`);
  }
  return {
    ...parseModelOptions({
      model: values.model,
      models: values.models,
      effort: values.effort,
      judge: values['judge-model'],
    }),
    setFile: values.set ?? DEFAULT_SET,
    trials,
    configNames:
      values.configs === undefined ? null : values.configs.split(',').map((name) => name.trim()),
    taskIds: values.task === undefined ? null : values.task.split(',').map((id) => id.trim()),
    suite: parseSuite(values.suite),
    judge: !values['no-judge'],
  };
}

function parseModelOptions(input: {
  model: string | undefined;
  models: string | undefined;
  effort: string | undefined;
  judge: string | undefined;
}): Pick<EvalOptions, 'modelKeys' | 'judgeModelKey' | 'reasoningEffort'> {
  if (input.model !== undefined && input.models !== undefined) {
    throw new Error('Укажите --model или --models, оба флага вместе не поддерживаются');
  }
  const modelKeys = input.models ?? input.model;
  return {
    modelKeys: modelKeys === undefined ? null : parseEvalModelKeys(modelKeys),
    judgeModelKey: input.judge ?? 'default',
    reasoningEffort: parseEffort(input.effort),
  };
}

function parseSuite(value: string | undefined): EvalSuite | null {
  if (value === undefined) {
    return null;
  }
  const suite = EVAL_SUITES.find((candidate) => candidate === value);
  if (suite === undefined) {
    throw new Error(`--suite: ${EVAL_SUITES.join(' или ')}`);
  }
  return suite;
}

function parseEffort(value: string | undefined): ReasoningEffort | undefined {
  if (value === undefined) {
    return undefined;
  }
  const effort = REASONING_EFFORTS.find((entry) => entry === value);
  if (effort === undefined) {
    throw new Error(`--effort: ${REASONING_EFFORTS.join(', ')}`);
  }
  return effort;
}

async function readSet(path: string): Promise<EvalSet> {
  const parsed = evalSetSchema.safeParse(JSON.parse(await readFile(path, 'utf8')));
  if (!parsed.success) {
    throw new Error(`Набор задач ${path}: ${parsed.error.message}`);
  }
  const withoutTask = parsed.data.tasks.find(
    (task) => (parsed.data.kind === 'arena') !== (task.arenaTask !== undefined),
  );
  if (withoutTask !== undefined) {
    throw new Error(
      `Набор задач ${path}: у задачи «${withoutTask.id}» arenaTask должен быть, только если набор — arena`,
    );
  }
  return parsed.data;
}

function pickTasks(set: EvalSet, ids: string[] | null): EvalTask[] {
  if (ids === null) {
    return set.tasks;
  }
  return ids.map((id) => {
    const task = set.tasks.find((candidate) => candidate.id === id);
    if (task === undefined) {
      throw new Error(`--task: нет задачи «${id}» в наборе «${set.name}»`);
    }
    return task;
  });
}

interface ContextInput {
  options: EvalOptions;
  set: EvalSet;
  tasks: EvalTask[];
  configs: EvalExecutionConfig[];
  loadedSettings: LoadedSettings;
  projectRoot: string;
}

async function createContext(input: ContextInput): Promise<EvalContext> {
  const { options, set, tasks, configs, loadedSettings, projectRoot } = input;
  const { settings } = loadedSettings;
  const judgeSelection = await prepareJudge(input);
  const startedAt = new Date().toISOString();
  const directory = join(projectRoot, settings.traces.directory, 'evals');
  await mkdir(directory, { recursive: true });
  const stamp = startedAt.slice(0, 19).replaceAll(':', '-');
  return {
    loadedSettings,
    projectRoot,
    temporaryRoot: await mkdtemp(join(tmpdir(), 'harness-eval-')),
    judge:
      judgeSelection === null
        ? null
        : await startEvalJudge(judgeSelection.loadedSettings, projectRoot),
    reportPath: join(directory, `${stamp}_${basename(options.setFile, '.json')}.json`),
    total: tasks.length * configs.length * options.trials,
    configs,
    report: {
      kind: 'evalReport',
      version: EVAL_REPORT_VERSION,
      set: { name: set.name, description: set.description, file: options.setFile },
      model: reportModel(configs),
      reasoningEffort: reportEffort(configs),
      startedAt,
      finishedAt: null,
      trials: options.trials,
      configs: configs.map(({ name, description, model, reasoningEffort, variant }) => ({
        name,
        description,
        model,
        reasoningEffort,
        variantName: variant.name,
      })),
      tasks,
      results: [],
      judgeTracePath: null,
      judgeModel: judgeSelection?.model ?? null,
    },
  };
}

async function prepareJudge(
  input: ContextInput,
): Promise<{ loadedSettings: LoadedSettings; model: EvalModel } | null> {
  if (!input.options.judge || !input.tasks.some(hasJudge)) {
    return null;
  }
  const key = input.options.judgeModelKey;
  const selection = await selectEvalModel(input.loadedSettings, key);
  validateModelEffort(input.loadedSettings, key, 'off');
  return selection;
}

function reportModel(configs: EvalExecutionConfig[]): string {
  const models = [...new Set(configs.map((config) => config.model.model))];
  return models.length === 1 ? (models[0] ?? 'multiple') : 'multiple';
}

function reportEffort(configs: EvalExecutionConfig[]): string {
  const efforts = [...new Set(configs.map((config) => config.reasoningEffort))];
  return efforts.length === 1 ? (efforts[0] ?? 'mixed') : 'mixed';
}

function hasJudge(task: EvalTask): boolean {
  return task.checks.some((check) => check.kind === 'judge');
}

function printIntroduction(context: EvalContext): void {
  const { report } = context;
  console.log(
    styleText(
      'bold',
      `Evals «${report.set.name}»: ${String(report.tasks.length)} задач × ` +
        `${String(report.configs.length)} конф. × ${String(report.trials)} попыток = ` +
        `${String(context.total)} сессий · ${evalReportModelLabel(report)} · effort ${report.reasoningEffort}`,
    ),
  );
  for (const config of report.configs) {
    console.log(
      styleText(
        'dim',
        `${config.name} — ${config.description} · ${evalConfigModelLabel(report, config.name)}`,
      ),
    );
  }
  if (context.judge === null) {
    console.log(styleText('dim', 'Судья выключен: проверки с рубрикой останутся без вердикта.'));
  }
}

async function runTrial(
  task: EvalTask,
  config: EvalExecutionConfig,
  trial: number,
  context: EvalContext,
): Promise<TrialResult> {
  const number = context.report.results.length + 1;
  const { projectRoot } = context;
  const session =
    config.kind === 'arena'
      ? await runArenaTrial(task, config, context)
      : await runQuestionTrial(task, config, number, context);
  const events = await readTrace(join(projectRoot, session.tracePath));
  const checks = await runChecks(task, events, context.judge);
  const result = describeTrial({ task, config, trial, session, events, checks });
  console.log(describeProgress(result, number, context.total));
  return result;
}

async function runQuestionTrial(
  task: EvalTask,
  config: Extract<EvalExecutionConfig, { kind: 'questions' }>,
  number: number,
  context: EvalContext,
): Promise<{ tracePath: string; failed: boolean }> {
  const { loadedSettings, variant, reasoningEffort } = config;
  const { projectRoot } = context;
  return runCliSession({
    loadedSettings,
    projectRoot,
    question: task.question,
    reasoningEffort,
    searchProvider: null,
    retrievalMode: variant.retrievalMode,
    retrievalToolName: variant.retrievalToolName,
    freshWorkspace: false,
    subagents: null,
    orchestration: null,
    demoProject: true,
    workspaceDirectory: join(context.temporaryRoot, `trial-${String(number)}`),
    verbose: false,
    quiet: true,
  });
}

// Попытка арены — прогон задачи в своей копии проекта; приёмка — событием в трейсе. Копию
// после попытки удаляем: всё, что агент делал, — в трейсе, а копий за прогон набираются десятки.
async function runArenaTrial(
  task: EvalTask,
  config: Extract<EvalExecutionConfig, { kind: 'arena' }>,
  context: EvalContext,
): Promise<{ tracePath: string; failed: boolean }> {
  const { loadedSettings, variant, reasoningEffort } = config;
  const { projectRoot } = context;
  const arena = await prepareArenaRun({
    projectRoot,
    settings: loadedSettings.settings.arena,
    taskId: task.arenaTask ?? task.id,
    runTests: variant.runTests,
    contextPreset: variant.contextPreset,
    maxIterations: variant.maxIterations,
  });
  try {
    return await runCliSession({
      ...arenaSessionInput({
        loadedSettings,
        projectRoot,
        arena,
        reasoningEffort,
        question: null,
      }),
      verbose: false,
      quiet: true,
    });
  } finally {
    await rm(arena.directory, { recursive: true, force: true });
  }
}

async function runChecks(
  task: EvalTask,
  events: HarnessEvent[],
  judge: EvalJudge | null,
): Promise<CheckResult[]> {
  const answer = readTrialFacts(events).answer;
  const results: CheckResult[] = [];
  for (const check of task.checks) {
    const result = runCodeCheck(check, events);
    if (check.kind === 'judge' && judge !== null && answer !== null) {
      const verdict = await judge.judge(task.question, check.rubric, answer);
      result.passed = verdict.passed;
      result.detail = verdict.explanation;
    }
    results.push(result);
  }
  return results;
}

interface TrialInput {
  task: EvalTask;
  config: EvalExecutionConfig;
  trial: number;
  session: { tracePath: string; failed: boolean };
  events: HarnessEvent[];
  checks: CheckResult[];
}

function describeTrial(input: TrialInput): TrialResult {
  const { task, config, trial, session, events, checks } = input;
  const facts = readTrialFacts(events);
  return {
    actualModels: [
      ...new Set(
        events.flatMap((event) => (event.type === 'model_response' ? [event.reply.model] : [])),
      ),
    ],
    taskId: task.id,
    config: config.name,
    trial,
    tracePath: session.tracePath,
    failed: session.failed,
    checks,
    passed: trialPassed(session.failed, checks),
    modelRequests: facts.modelRequests,
    toolCalls: facts.toolCalls.length,
    costUsd: facts.costUsd,
    durationMs: facts.durationMs,
    cacheWarm: readFirstRequestCache(events) === 'warm',
    answer: facts.answer,
  };
}

function describeProgress(result: TrialResult, number: number, total: number): string {
  const colors = { '✓': 'green', '✗': 'red', '?': 'yellow' } as const;
  const sign = markOf(result.passed);
  const mark = styleText(colors[sign as keyof typeof colors], sign);
  const failedChecks = result.checks
    .filter((check) => check.passed !== true)
    .map((check) => `${markOf(check.passed)} ${check.label} — ${check.detail}`);
  const cost = result.costUsd === null ? '?' : formatFixed(result.costUsd, 6);
  const head =
    `  [${String(number)}/${String(total)}] ${mark} ${result.taskId} · ${result.config} · ` +
    `попытка ${String(result.trial)}: ${String(result.modelRequests)} запр., ${cost} USD`;
  const failure = result.failed ? [`✗ сессия оборвалась ошибкой — ${result.tracePath}`] : [];
  const lines = [
    head,
    ...[...failure, ...failedChecks].map((line) => styleText('dim', `      ${line}`)),
  ];
  return lines.join('\n');
}

async function saveReport(context: EvalContext): Promise<void> {
  await writeFile(context.reportPath, `${JSON.stringify(context.report, null, 2)}\n`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

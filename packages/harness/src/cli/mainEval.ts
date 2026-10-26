// Точка входа pnpm eval (этап 8e): набор задач из evals/, k попыток каждой задачи в каждой
// конфигурации, проверки кодом по трейсу и судья по рубрике, итоги pass@k и pass^k.
//   pnpm eval                              — evals/kedr.json, конфигурации tool и auto, по 3 попытки
//   pnpm eval --trials 5                   — по 5 попыток
//   pnpm eval --configs tool,auto,rewrite  — конфигурации из compare-runs
//   pnpm eval --task vacation-days         — только эти задачи (через запятую)
//   pnpm eval --no-judge                   — без судьи: только проверки кодом, без лишних денег
//
// Каждая попытка — обычная сессия со своим трейсом в traces/ и своей временной рабочей
// папкой из примеров. Конфигурации чередуются внутри попытки: кэш промпта, прогретый
// предыдущей сессией, достаётся всем. Отчёт — JSON в traces/evals/.

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { parseArgs, styleText } from 'node:util';
import { readTrace } from '../grounding/readTrace.js';
import { RUN_VARIANTS, type RunVariant } from '../runComparison/comparisonVariants.js';
import { readFirstRequestCache } from '../runComparison/summarizeRun.js';
import { readTrialFacts, runCodeCheck, type CheckResult } from '../evals/codeChecks.js';
import {
  EVAL_REPORT_VERSION,
  trialPassed,
  type EvalReport,
  type TrialResult,
} from '../evals/evalReport.js';
import { evalSetSchema, type EvalSet, type EvalTask } from '../evals/evalSet.js';
import { markOf, printEvalSummary } from '../evals/printEvalSummary.js';
import { startEvalJudge, type EvalJudge } from '../evals/judgeAnswers.js';
import type { HarnessEvent } from '../events/harnessEvents.js';
import { loadSettings, type LoadedSettings } from '../settings/loadSettings.js';
import { runCliSession } from './runCliSession.js';

const DEFAULT_SET = 'evals/kedr.json';
const DEFAULT_CONFIGS = ['tool', 'auto'];
const DEFAULT_TRIALS = 3;
const MAX_TRIALS = 10;

interface EvalOptions {
  setFile: string;
  trials: number;
  configs: RunVariant[];
  taskIds: string[] | null;
  judge: boolean;
}

interface EvalContext {
  loadedSettings: LoadedSettings;
  projectRoot: string;
  temporaryRoot: string;
  judge: EvalJudge | null;
  report: EvalReport;
  reportPath: string;
  total: number;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const projectRoot = process.cwd();
  const loadedSettings = await loadSettings(projectRoot);
  const set = await readSet(join(projectRoot, options.setFile));
  const tasks = pickTasks(set, options.taskIds);
  const context = await createContext({ options, set, tasks, loadedSettings, projectRoot });
  printIntroduction(context);
  try {
    for (const { task, config, trial } of planTrials(options, tasks)) {
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
// Конфигурации чередуются, поэтому прогретый кэш и время суток достаются всем поровну.
function planTrials(
  options: EvalOptions,
  tasks: EvalTask[],
): { task: EvalTask; config: RunVariant; trial: number }[] {
  const plan = [];
  for (let trial = 1; trial <= options.trials; trial += 1) {
    for (const task of tasks) {
      plan.push(...options.configs.map((config) => ({ task, config, trial })));
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
      'no-judge': { type: 'boolean', default: false },
    },
  });
  const trials = values.trials === undefined ? DEFAULT_TRIALS : Number(values.trials);
  if (!Number.isInteger(trials) || trials < 1 || trials > MAX_TRIALS) {
    throw new Error(`--trials: целое число от 1 до ${String(MAX_TRIALS)}`);
  }
  return {
    setFile: values.set ?? DEFAULT_SET,
    trials,
    configs: parseConfigs(values.configs),
    taskIds: values.task === undefined ? null : values.task.split(',').map((id) => id.trim()),
    judge: !values['no-judge'],
  };
}

function parseConfigs(value: string | undefined): RunVariant[] {
  const names = value === undefined ? DEFAULT_CONFIGS : value.split(',');
  return names.map((name) => {
    const variant = RUN_VARIANTS.find((candidate) => candidate.name === name.trim());
    if (variant === undefined) {
      const known = RUN_VARIANTS.map((candidate) => candidate.name).join(', ');
      throw new Error(`--configs: неизвестная конфигурация «${name}». Допустимые: ${known}`);
    }
    return variant;
  });
}

async function readSet(path: string): Promise<EvalSet> {
  const parsed = evalSetSchema.safeParse(JSON.parse(await readFile(path, 'utf8')));
  if (!parsed.success) {
    throw new Error(`Набор задач ${path}: ${parsed.error.message}`);
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
  loadedSettings: LoadedSettings;
  projectRoot: string;
}

async function createContext(input: ContextInput): Promise<EvalContext> {
  const { options, set, tasks, loadedSettings, projectRoot } = input;
  const { settings } = loadedSettings;
  const startedAt = new Date().toISOString();
  const directory = join(projectRoot, settings.traces.directory, 'evals');
  await mkdir(directory, { recursive: true });
  const stamp = startedAt.slice(0, 19).replaceAll(':', '-');
  const usesJudge = options.judge && tasks.some((task) => hasJudge(task));
  return {
    loadedSettings,
    projectRoot,
    temporaryRoot: await mkdtemp(join(tmpdir(), 'harness-eval-')),
    judge: usesJudge ? await startEvalJudge(loadedSettings, projectRoot) : null,
    reportPath: join(directory, `${stamp}_${basename(options.setFile, '.json')}.json`),
    total: tasks.length * options.configs.length * options.trials,
    report: {
      kind: 'evalReport',
      version: EVAL_REPORT_VERSION,
      set: { name: set.name, description: set.description, file: options.setFile },
      model: settings.model.model,
      reasoningEffort: settings.model.defaultReasoningEffort,
      startedAt,
      finishedAt: null,
      trials: options.trials,
      configs: options.configs.map(({ name, description }) => ({ name, description })),
      tasks,
      results: [],
      judgeTracePath: null,
    },
  };
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
        `${String(context.total)} сессий · ${report.model} · effort ${report.reasoningEffort}`,
    ),
  );
  for (const config of report.configs) {
    console.log(styleText('dim', `${config.name} — ${config.description}`));
  }
  if (context.judge === null) {
    console.log(styleText('dim', 'Судья выключен: проверки с рубрикой останутся без вердикта.'));
  }
}

async function runTrial(
  task: EvalTask,
  config: RunVariant,
  trial: number,
  context: EvalContext,
): Promise<TrialResult> {
  const number = context.report.results.length + 1;
  const { loadedSettings, projectRoot } = context;
  const session = await runCliSession({
    loadedSettings,
    projectRoot,
    question: task.question,
    reasoningEffort: loadedSettings.settings.model.defaultReasoningEffort,
    searchProvider: null,
    retrievalMode: config.retrievalMode,
    retrievalToolName: config.retrievalToolName,
    freshWorkspace: false,
    subagents: null,
    orchestration: null,
    demoProject: true,
    workspaceDirectory: join(context.temporaryRoot, `trial-${String(number)}`),
    verbose: false,
    quiet: true,
  });
  const events = await readTrace(join(projectRoot, session.tracePath));
  const checks = await runChecks(task, events, context.judge);
  const result = describeTrial({ task, config, trial, session, events, checks });
  console.log(describeProgress(result, number, context.total));
  return result;
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
  config: RunVariant;
  trial: number;
  session: { tracePath: string; failed: boolean };
  events: HarnessEvent[];
  checks: CheckResult[];
}

function describeTrial(input: TrialInput): TrialResult {
  const { task, config, trial, session, events, checks } = input;
  const facts = readTrialFacts(events);
  return {
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
  };
}

function describeProgress(result: TrialResult, number: number, total: number): string {
  const colors = { '✓': 'green', '✗': 'red', '?': 'yellow' } as const;
  const sign = markOf(result.passed);
  const mark = styleText(colors[sign as keyof typeof colors], sign);
  const failedChecks = result.checks
    .filter((check) => check.passed !== true)
    .map((check) => `${markOf(check.passed)} ${check.label} — ${check.detail}`);
  const cost = result.costUsd === null ? '?' : result.costUsd.toFixed(6);
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

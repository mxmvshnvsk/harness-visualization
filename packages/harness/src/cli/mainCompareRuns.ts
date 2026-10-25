// Точка входа pnpm compare-runs: одни и те же вопросы по нескольку раз в каждом варианте поиска
// и сводка с разбросом. Варианты — в runComparison/comparisonVariants.ts:
// tool (модель ищет сама), auto (харнесс ищет словами пользователя), rewrite (харнесс ищет
// запросом, который составила модель), hybrid (как auto, но гибридным поиском).
//   pnpm compare-runs                       — все вопросы, варианты tool, auto, rewrite, по 3 прогона
//   pnpm compare-runs --runs 5              — по 5 прогонов
//   pnpm compare-runs --question 2          — только второй вопрос
//   pnpm compare-runs --variants auto,hybrid — только эти варианты
//
// Каждый прогон — обычная сессия со своим трейсом в traces/. Варианты чередуются
// (tool, auto, rewrite, tool, …): кэш промпта, прогретый предыдущей сессией, достаётся всем.
// Рабочая папка у каждого прогона своя, временная, из примеров: заметки одного прогона
// не должны влиять на другие. Действия, требующие разрешения, запрещаются — спросить некого.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs, styleText } from 'node:util';
import { formatNumber } from '../events/formatForConsole.js';
import { readTrace } from '../grounding/readTrace.js';
import { aggregateRuns, type RunsAggregate, type Spread } from '../runComparison/aggregateRuns.js';
import {
  COMPARISON_QUESTIONS,
  type ComparisonQuestion,
} from '../runComparison/comparisonQuestions.js';
import {
  DEFAULT_VARIANT_NAMES,
  RUN_VARIANTS,
  type RunVariant,
} from '../runComparison/comparisonVariants.js';
import { summarizeRun, type RunSummary } from '../runComparison/summarizeRun.js';
import { loadSettings, type LoadedSettings } from '../settings/loadSettings.js';
import { runCliSession } from './runCliSession.js';

const DEFAULT_RUNS = 3;
const MAX_RUNS = 10;
const COLUMN_WIDTHS = [8, 11, 10, 22, 15, 15, 11, 10, 10, 12];
const COLUMN_TITLES = [
  'вариант',
  'запросов',
  'тулов',
  'input, токенов',
  'cache hit',
  'cache warm',
  'USD',
  'прочитан',
  'назван',
  'противоречие',
];

interface CompareRunsOptions {
  runs: number;
  questions: ComparisonQuestion[];
  variants: RunVariant[];
}

interface ComparisonContext {
  loadedSettings: LoadedSettings;
  projectRoot: string;
  temporaryRoot: string;
  totalSessions: number;
  // Сколько сессий уже запущено — для строки хода работы и имени рабочей папки.
  startedSessions: number;
}

// Имя варианта → итоги его прогонов.
type RunsByVariant = Map<string, RunSummary[]>;

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const projectRoot = process.cwd();
  const loadedSettings = await loadSettings(projectRoot);
  const totalSessions = options.questions.length * options.variants.length * options.runs;
  printIntroduction(options, loadedSettings, totalSessions);
  const context: ComparisonContext = {
    loadedSettings,
    projectRoot,
    temporaryRoot: await mkdtemp(join(tmpdir(), 'harness-compare-runs-')),
    totalSessions,
    startedSessions: 0,
  };
  const allRuns: RunsByVariant = new Map(options.variants.map((variant) => [variant.name, []]));
  try {
    for (const [index, question] of options.questions.entries()) {
      console.log(`\n${styleText('bold', `${index + 1}. «${question.query}»`)}`);
      console.log(styleText('dim', `   нужный документ: ${question.expectedDocumentId}`));
      const runs = await runQuestion(question, options, context);
      printTable(runs);
      printDocumentsRead(runs);
      for (const [name, summaries] of runs) {
        allRuns.get(name)?.push(...summaries);
      }
    }
    console.log(`\n${styleText('bold', 'Все вопросы вместе')}`);
    printTable(allRuns);
    printTotalCost(allRuns);
  } finally {
    await rm(context.temporaryRoot, { recursive: true, force: true });
  }
}

function parseOptions(argumentList: string[]): CompareRunsOptions {
  const { values } = parseArgs({
    args: argumentList,
    options: {
      runs: { type: 'string' },
      question: { type: 'string' },
      variants: { type: 'string' },
    },
  });
  return {
    runs: parseRuns(values.runs),
    questions: parseQuestions(values.question),
    variants: parseVariants(values.variants),
  };
}

function parseRuns(value: string | undefined): number {
  const runs = value === undefined ? DEFAULT_RUNS : Number(value);
  if (!Number.isInteger(runs) || runs < 1 || runs > MAX_RUNS) {
    throw new Error(`--runs: целое число от 1 до ${MAX_RUNS}`);
  }
  return runs;
}

function parseQuestions(value: string | undefined): ComparisonQuestion[] {
  if (value === undefined) {
    return COMPARISON_QUESTIONS;
  }
  const question = COMPARISON_QUESTIONS[Number(value) - 1];
  if (question === undefined) {
    throw new Error(`--question: номер от 1 до ${COMPARISON_QUESTIONS.length}`);
  }
  return [question];
}

function parseVariants(value: string | undefined): RunVariant[] {
  const names = value === undefined ? DEFAULT_VARIANT_NAMES : value.split(',');
  return names.map((name) => {
    const variant = RUN_VARIANTS.find((candidate) => candidate.name === name.trim());
    if (variant === undefined) {
      const known = RUN_VARIANTS.map((candidate) => candidate.name).join(', ');
      throw new Error(`--variants: неизвестный вариант «${name}». Допустимые: ${known}`);
    }
    return variant;
  });
}

function printIntroduction(
  options: CompareRunsOptions,
  loadedSettings: LoadedSettings,
  totalSessions: number,
): void {
  const { model } = loadedSettings.settings;
  console.log(
    styleText(
      'bold',
      `Повторные прогоны: ${options.questions.length} вопр. × ${options.variants.length} вар. × ` +
        `${options.runs} = ${totalSessions} сессий · ${model.model} · effort ${model.defaultReasoningEffort}`,
    ),
  );
  for (const variant of options.variants) {
    console.log(styleText('dim', `${variant.name} — ${variant.description}`));
  }
  console.log(
    styleText(
      'dim',
      '«Cache warm» — в скольких прогонах prompt cache был прогрет уже к первому шагу агента: ' +
        'начало запроса недавно отправляла предыдущая сессия или другая программа с тем же ключом. ' +
        'Такой прогон дешевле не из-за варианта.',
    ),
  );
  console.log(
    styleText(
      'dim',
      '«Назван» — модель назвала нужный документ в ответе в обратных кавычках, как его ищет ' +
        'check-grounding; id без кавычек или жирным не считается.',
    ),
  );
}

// Варианты чередуются внутри каждого повтора, а не идут блоками.
async function runQuestion(
  question: ComparisonQuestion,
  options: CompareRunsOptions,
  context: ComparisonContext,
): Promise<RunsByVariant> {
  const results: RunsByVariant = new Map(options.variants.map((variant) => [variant.name, []]));
  for (let run = 1; run <= options.runs; run += 1) {
    for (const variant of options.variants) {
      results.get(variant.name)?.push(await runOnce(question, variant, context));
    }
  }
  return results;
}

async function runOnce(
  question: ComparisonQuestion,
  variant: RunVariant,
  context: ComparisonContext,
): Promise<RunSummary> {
  context.startedSessions += 1;
  const { loadedSettings, projectRoot } = context;
  const result = await runCliSession({
    loadedSettings,
    projectRoot,
    question: question.query,
    reasoningEffort: loadedSettings.settings.model.defaultReasoningEffort,
    searchProvider: null,
    retrievalMode: variant.retrievalMode,
    retrievalToolName: variant.retrievalToolName,
    freshWorkspace: false,
    subagents: null,
    workspaceDirectory: join(context.temporaryRoot, `session-${context.startedSessions}`),
    verbose: false,
    quiet: true,
  });
  const events = await readTrace(join(projectRoot, result.tracePath));
  const summary = summarizeRun(events, question, result.failed);
  console.log(styleText('dim', describeProgress(summary, variant, context, result.tracePath)));
  return summary;
}

function describeProgress(
  summary: RunSummary,
  variant: RunVariant,
  context: ComparisonContext,
  tracePath: string,
): string {
  const head = `   [${context.startedSessions}/${context.totalSessions}] ${variant.name}`;
  if (summary.failed) {
    return `${head}: ошибка — ${tracePath}`;
  }
  const cost =
    summary.costUsd === null ? 'стоимость неизвестна' : `${summary.costUsd.toFixed(6)} USD`;
  const seconds = (summary.durationMs / 1000).toFixed(1);
  const cache = summary.firstRequestCache === 'warm' ? 'cache warm' : 'cache cold';
  const query = summary.harnessQuery === null ? '' : `, query харнесса «${summary.harnessQuery}»`;
  return (
    `${head}: запросов ${summary.modelRequests}, input ${formatNumber(summary.inputTokens)}, ` +
    `${cost}, ${seconds} с, ${cache}${query} — ${tracePath}`
  );
}

function printTable(runs: RunsByVariant): void {
  console.log(styleText('dim', formatRow(COLUMN_TITLES)));
  for (const [name, summaries] of runs) {
    console.log(formatRow(describeAggregate(name, aggregateRuns(summaries))));
  }
}

// ✗2 у варианта — две сессии из прогонов прервались ошибкой; их трейсы — в строках хода работы.
function describeAggregate(name: string, aggregate: RunsAggregate): string[] {
  const ofRuns = (count: number): string => `${count} из ${aggregate.runs}`;
  return [
    aggregate.failed > 0 ? `${name} ✗${aggregate.failed}` : name,
    describeSpread(aggregate.modelRequests, formatNumber),
    describeSpread(aggregate.toolCalls, formatNumber),
    describeSpread(aggregate.inputTokens, formatTokens),
    describeSpread(aggregate.cacheHitShare, formatPercent),
    ofRuns(aggregate.firstRequestWarm),
    aggregate.costUsd === null ? '?' : aggregate.costUsd.median.toFixed(6),
    ofRuns(aggregate.expectedReadFully),
    ofRuns(aggregate.expectedCited),
    aggregate.mentionsContradiction === null
      ? '—'
      : `${aggregate.mentionsContradiction} из ${aggregate.contradictionChecks}`,
  ];
}

// «2» — если все прогоны совпали, иначе «2 (2–3)»: медиана и разброс.
function describeSpread(spread: Spread, format: (value: number) => string): string {
  const median = format(spread.median);
  if (spread.min === spread.max) {
    return median;
  }
  return `${median} (${format(spread.min)}–${format(spread.max)})`;
}

// Медиана чётного числа прогонов бывает дробной; полтокена смысла не имеют.
function formatTokens(tokens: number): string {
  return formatNumber(Math.round(tokens));
}

function formatPercent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

function formatRow(cells: string[]): string {
  const padded = cells.map((cell, index) => cell.padEnd(COLUMN_WIDTHS[index] ?? 0));
  return `   ${padded.join(' ')}`.trimEnd();
}

function printDocumentsRead(runs: RunsByVariant): void {
  for (const [name, summaries] of runs) {
    const counts = aggregateRuns(summaries).documentsRead;
    const described = [...counts.entries()].map(([documentId, count]) => `${documentId} ×${count}`);
    const text = described.length === 0 ? 'ничего' : described.join(', ');
    console.log(styleText('dim', `   ${name} читал целиком: ${text}`));
  }
}

function printTotalCost(runs: RunsByVariant): void {
  const parts = [...runs].map(([name, summaries]) => {
    const total = aggregateRuns(summaries).costUsdTotal;
    return `${name} ${total === null ? '?' : total.toFixed(6)} USD`;
  });
  console.log(`   всего потрачено: ${parts.join(' · ')}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

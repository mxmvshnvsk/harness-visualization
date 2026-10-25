// Точка входа pnpm compare-runs: одни и те же вопросы по нескольку раз в каждом режиме поиска
// (модель ищет сама — tool, харнесс подмешивает найденное — auto) и сводка с разбросом.
//   pnpm compare-runs                — все вопросы, по 3 прогона на режим
//   pnpm compare-runs --runs 5       — по 5 прогонов
//   pnpm compare-runs --question 2   — только второй вопрос
//
// Каждый прогон — обычная сессия со своим трейсом в traces/. Режимы чередуются
// (tool, auto, tool, …): кэш промпта, прогретый предыдущей сессией, достаётся обоим поровну.
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
import { summarizeRun, type RunSummary } from '../runComparison/summarizeRun.js';
import { loadSettings, type LoadedSettings } from '../settings/loadSettings.js';
import type { RetrievalMode } from '../settings/settingsSchema.js';
import { runCliSession } from './runCliSession.js';

const MODES: RetrievalMode[] = ['tool', 'auto'];
const DEFAULT_RUNS = 3;
const MAX_RUNS = 10;
const COLUMN_WIDTHS = [8, 11, 10, 22, 15, 15, 11, 10, 10, 12];
const COLUMN_TITLES = [
  'режим',
  'запросов',
  'тулов',
  'вход, токенов',
  'из кэша',
  'прогрет к 1-му',
  'USD',
  'прочитан',
  'назван',
  'противоречие',
];

interface CompareRunsOptions {
  runs: number;
  questions: ComparisonQuestion[];
}

interface ComparisonContext {
  loadedSettings: LoadedSettings;
  projectRoot: string;
  temporaryRoot: string;
  totalSessions: number;
  // Сколько сессий уже запущено — для строки хода работы и имени рабочей папки.
  startedSessions: number;
}

type RunsByMode = Record<RetrievalMode, RunSummary[]>;

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const projectRoot = process.cwd();
  const loadedSettings = await loadSettings(projectRoot);
  const { model } = loadedSettings.settings;
  const totalSessions = options.questions.length * MODES.length * options.runs;
  console.log(
    styleText(
      'bold',
      `Повторные прогоны: ${options.questions.length} вопр. × ${MODES.length} режима × ` +
        `${options.runs} = ${totalSessions} сессий · ${model.model} · effort ${model.defaultReasoningEffort}`,
    ),
  );
  console.log(
    styleText(
      'dim',
      '«Прогрет к 1-му» — в скольких прогонах кэш промпта был прогрет уже к первому запросу: ' +
        'начало запроса недавно отправляла предыдущая сессия или другая программа с тем же ключом. ' +
        'Такой прогон дешевле не из-за режима.',
    ),
  );
  const context: ComparisonContext = {
    loadedSettings,
    projectRoot,
    temporaryRoot: await mkdtemp(join(tmpdir(), 'harness-compare-runs-')),
    totalSessions,
    startedSessions: 0,
  };
  const allRuns: RunsByMode = { tool: [], auto: [] };
  try {
    for (const [index, question] of options.questions.entries()) {
      console.log(`\n${styleText('bold', `${index + 1}. «${question.query}»`)}`);
      console.log(styleText('dim', `   нужный документ: ${question.expectedDocumentId}`));
      const runs = await runQuestion(question, options.runs, context);
      printTable(runs);
      printDocumentsRead(runs);
      allRuns.tool.push(...runs.tool);
      allRuns.auto.push(...runs.auto);
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
    options: { runs: { type: 'string' }, question: { type: 'string' } },
  });
  const runs = values.runs === undefined ? DEFAULT_RUNS : Number(values.runs);
  if (!Number.isInteger(runs) || runs < 1 || runs > MAX_RUNS) {
    throw new Error(`--runs: целое число от 1 до ${MAX_RUNS}`);
  }
  if (values.question === undefined) {
    return { runs, questions: COMPARISON_QUESTIONS };
  }
  const question = COMPARISON_QUESTIONS[Number(values.question) - 1];
  if (question === undefined) {
    throw new Error(`--question: номер от 1 до ${COMPARISON_QUESTIONS.length}`);
  }
  return { runs, questions: [question] };
}

// Режимы чередуются внутри каждого повтора, а не идут блоками.
async function runQuestion(
  question: ComparisonQuestion,
  runs: number,
  context: ComparisonContext,
): Promise<RunsByMode> {
  const results: RunsByMode = { tool: [], auto: [] };
  for (let run = 1; run <= runs; run += 1) {
    for (const mode of MODES) {
      results[mode].push(await runOnce(question, mode, context));
    }
  }
  return results;
}

async function runOnce(
  question: ComparisonQuestion,
  mode: RetrievalMode,
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
    retrievalMode: mode,
    freshWorkspace: false,
    workspaceDirectory: join(context.temporaryRoot, `session-${context.startedSessions}`),
    verbose: false,
    quiet: true,
  });
  const events = await readTrace(join(projectRoot, result.tracePath));
  const summary = summarizeRun(events, question, result.failed);
  console.log(styleText('dim', describeProgress(summary, mode, context, result.tracePath)));
  return summary;
}

function describeProgress(
  summary: RunSummary,
  mode: RetrievalMode,
  context: ComparisonContext,
  tracePath: string,
): string {
  const head = `   [${context.startedSessions}/${context.totalSessions}] ${mode}`;
  if (summary.failed) {
    return `${head}: ошибка — ${tracePath}`;
  }
  const cost =
    summary.costUsd === null ? 'стоимость неизвестна' : `${summary.costUsd.toFixed(6)} USD`;
  const seconds = (summary.durationMs / 1000).toFixed(1);
  const cache = summary.firstRequestCache === 'warm' ? 'кэш прогрет' : 'кэш холодный';
  return (
    `${head}: запросов ${summary.modelRequests}, вход ${formatNumber(summary.inputTokens)}, ` +
    `${cost}, ${seconds} с, ${cache} — ${tracePath}`
  );
}

function printTable(runs: RunsByMode): void {
  console.log(styleText('dim', formatRow(COLUMN_TITLES)));
  for (const mode of MODES) {
    console.log(formatRow(describeAggregate(mode, aggregateRuns(runs[mode]))));
  }
}

function describeAggregate(mode: RetrievalMode, aggregate: RunsAggregate): string[] {
  const ofRuns = (count: number): string => `${count} из ${aggregate.runs}`;
  return [
    aggregate.failed > 0 ? `${mode} ✗${aggregate.failed}` : mode,
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

// «Прогрет к 1-му» — кэш промпта прогрет уже к первому запросу сессии, то есть
// предыдущей сессией или другой программой с тем же ключом, а не этой сессией.
// Такой прогон дешевле не из-за режима — это нужно видеть, сравнивая стоимость.
// ✗2 у режима — две сессии из прогонов прервались ошибкой; их трейсы — в строках хода работы.
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
  return `   ${cells.map((cell, index) => cell.padEnd(COLUMN_WIDTHS[index] ?? 0)).join(' ')}`.trimEnd();
}

function printDocumentsRead(runs: RunsByMode): void {
  for (const mode of MODES) {
    const counts = aggregateRuns(runs[mode]).documentsRead;
    const described = [...counts.entries()].map(([documentId, count]) => `${documentId} ×${count}`);
    console.log(
      styleText(
        'dim',
        `   ${mode} читал целиком: ${described.length === 0 ? 'ничего' : described.join(', ')}`,
      ),
    );
  }
}

function printTotalCost(runs: RunsByMode): void {
  const parts = MODES.map((mode) => {
    const total = aggregateRuns(runs[mode]).costUsdTotal;
    return `${mode} ${total === null ? '?' : total.toFixed(6)} USD`;
  });
  console.log(`   всего потрачено: ${parts.join(' · ')}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

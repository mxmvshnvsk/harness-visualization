// Точка входа команды pnpm check-grounding <файл трейса> [--judge]:
// печатает, на какие источники сослался ответ и что модель видела по каждому (уровень 1),
// и на что опирается каждый claim ответа: дословные цитаты и сходство embeddings (уровень 2),
// а с --judge — ещё и мнение модели-судьи (уровень 3). Судья стоит денег, поэтому по флагу.

import { parseArgs, styleText } from 'node:util';
import {
  EMBEDDING_MODEL_DIRECTORY,
  ModelMissingError,
  TextEmbedder,
} from '@harness-visualization/embeddings';
import { formatMoney, formatUsage } from '../events/formatForConsole.js';
import type { ClaimCheck, SeenText } from '../grounding/claimTypes.js';
import { checkGrounding } from '../grounding/checkGrounding.js';
import { collectSeenTexts } from '../grounding/collectSeenTexts.js';
import { describeClaimsReport } from '../grounding/describeClaimsReport.js';
import { describeGroundingReport } from '../grounding/describeGroundingReport.js';
import { measureClaimSimilarity } from '../grounding/measureClaimSimilarity.js';
import { readTrace } from '../grounding/readTrace.js';
import { runGroundingJudge, type GroundingJudgeResult } from '../grounding/runGroundingJudge.js';
import type { HarnessEvent } from '../events/harnessEvents.js';
import { loadSettings, readConfigFile } from '../settings/loadSettings.js';

interface SimilarityOutcome {
  claims: ClaimCheck[];
  skippedReason: string | null;
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: { judge: { type: 'boolean', default: false } },
  });
  const tracePath = positionals[0];
  if (tracePath === undefined) {
    console.error('Укажите файл трейса: pnpm check-grounding traces/<файл>.jsonl [--judge]');
    process.exitCode = 1;
    return;
  }
  const projectRoot = process.cwd();
  const settings = await readConfigFile(projectRoot);
  const events = await readTrace(tracePath);
  const report = checkGrounding(events);
  const similarity = await addSimilarity(report.claims, collectSeenTexts(events));
  const judgeResult = values.judge
    ? await judge(similarity, { projectRoot, tracePath, events })
    : null;

  console.log(styleText('bold', `Grounding check (проверка опоры ответа) по трейсу ${tracePath}`));
  printLines(describeGroundingReport(report));
  console.log('');
  printLines(
    describeClaimsReport(judgeResult?.claims ?? similarity.claims, {
      similarityThreshold: settings.grounding.similarityThreshold,
      similaritySkippedReason: similarity.skippedReason,
    }),
  );
  if (judgeResult !== null) {
    printJudgeTotals(judgeResult);
  }
}

interface JudgeContext {
  projectRoot: string;
  tracePath: string;
  events: HarnessEvent[];
}

// Судье нужны ближайшие строки увиденного — без модели эмбеддингов их не найти.
async function judge(
  similarity: SimilarityOutcome,
  context: JudgeContext,
): Promise<GroundingJudgeResult> {
  if (similarity.skippedReason !== null) {
    throw new Error(`Судье нужны ближайшие строки увиденного. ${similarity.skippedReason}`);
  }
  console.log(
    styleText(
      'dim',
      `Судья (judge): ${String(similarity.claims.length)} claims — столько же запросов к модели.`,
    ),
  );
  return runGroundingJudge(similarity.claims, {
    loadedSettings: await loadSettings(context.projectRoot),
    projectRoot: context.projectRoot,
    sourceTracePath: context.tracePath,
    sourceEvents: context.events,
  });
}

function printJudgeTotals(result: GroundingJudgeResult): void {
  const totals = result.totals;
  const usage =
    totals === null ? '' : `, ${formatUsage(totals.usage)}, ${formatMoney(totals.modelCost)}`;
  const requests = totals === null ? '?' : String(totals.modelRequests);
  console.log(
    styleText('dim', `Судья: запросов ${requests}${usage} — трейс проверки ${result.tracePath}`),
  );
}

// Без скачанной модели эмбеддингов отчёт всё равно полезен: ссылки и цитаты проверяются кодом.
async function addSimilarity(
  claims: ClaimCheck[],
  seenTexts: SeenText[],
): Promise<SimilarityOutcome> {
  try {
    const embedder = await TextEmbedder.load({
      modelDirectory: EMBEDDING_MODEL_DIRECTORY,
      allowDownload: false,
    });
    return {
      claims: await measureClaimSimilarity(claims, seenTexts, embedder),
      skippedReason: null,
    };
  } catch (error) {
    if (error instanceof ModelMissingError) {
      return { claims, skippedReason: error.message };
    }
    throw error;
  }
}

function printLines(lines: string[]): void {
  for (const line of lines) {
    console.log(line);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

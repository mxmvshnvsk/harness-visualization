// Сводка нескольких прогонов одного режима: медиана и разброс вместо одного числа.
// Модель недетерминирована — один прогон может оказаться и удачным, и неудачным.

import type { RunSummary } from './summarizeRun.js';

export interface Spread {
  median: number;
  min: number;
  max: number;
}

export interface RunsAggregate {
  runs: number;
  failed: number;
  modelRequests: Spread;
  toolCalls: Spread;
  inputTokens: Spread;
  // Доля входа из кэша промпта, от 0 до 1.
  cacheHitShare: Spread;
  // null — хотя бы у одного прогона стоимость неизвестна.
  costUsd: Spread | null;
  costUsdTotal: number | null;
  expectedReadFully: number;
  expectedCited: number;
  // null — в вопросах нет противоречия.
  mentionsContradiction: number | null;
  contradictionChecks: number;
  // Документ → в скольких прогонах модель прочитала его целиком.
  documentsRead: Map<string, number>;
}

export function aggregateRuns(summaries: RunSummary[]): RunsAggregate {
  const costs = summaries.map((summary) => summary.costUsd);
  const knownCosts = costs.filter((cost) => cost !== null);
  const contradictionResults = summaries
    .map((summary) => summary.mentionsContradiction)
    .filter((result) => result !== null);
  return {
    runs: summaries.length,
    failed: summaries.filter((summary) => summary.failed).length,
    modelRequests: spreadOf(summaries.map((summary) => summary.modelRequests)),
    toolCalls: spreadOf(summaries.map((summary) => summary.toolCalls)),
    inputTokens: spreadOf(summaries.map((summary) => summary.inputTokens)),
    cacheHitShare: spreadOf(summaries.map(cacheHitShareOf)),
    costUsd: knownCosts.length === costs.length ? spreadOf(knownCosts) : null,
    costUsdTotal: knownCosts.length === costs.length ? sum(knownCosts) : null,
    expectedReadFully: summaries.filter((summary) => summary.expectedSeen === 'full').length,
    expectedCited: summaries.filter((summary) => summary.expectedCited).length,
    mentionsContradiction:
      contradictionResults.length === 0
        ? null
        : contradictionResults.filter((mentioned) => mentioned).length,
    contradictionChecks: contradictionResults.length,
    documentsRead: countDocumentsRead(summaries),
  };
}

function cacheHitShareOf(summary: RunSummary): number {
  return summary.inputTokens === 0 ? 0 : summary.inputCacheHitTokens / summary.inputTokens;
}

function countDocumentsRead(summaries: RunSummary[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const summary of summaries) {
    for (const documentId of summary.documentsRead) {
      counts.set(documentId, (counts.get(documentId) ?? 0) + 1);
    }
  }
  return counts;
}

export function spreadOf(values: number[]): Spread {
  const sorted = [...values].sort((first, second) => first - second);
  return {
    median: medianOfSorted(sorted),
    min: sorted[0] ?? 0,
    max: sorted.at(-1) ?? 0,
  };
}

// Для чётного числа значений — среднее двух средних.
function medianOfSorted(sorted: number[]): number {
  if (sorted.length === 0) {
    return 0;
  }
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? 0;
  }
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

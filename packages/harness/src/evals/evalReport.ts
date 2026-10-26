// Отчёт прогона evals и итоги по нему. Отчёт — JSON рядом с трейсами (traces/evals/):
// каждая попытка ссылается на свой трейс, поэтому любую клетку можно открыть и проверить.
// Без зависимостей от Node — итоги считает и интерфейс (@harness-visualization/harness/evals).
//
// pass@k — задача решена хоть раз из k попыток: «умеет ли агент». pass^k — решена во всех k:
// «можно ли на него положиться». При k = 1 они совпадают; чем больше k, тем дальше расходятся.

import type { CheckResult } from './codeChecks.js';
import type { EvalTask } from './evalSet.js';

export const EVAL_REPORT_VERSION = 1;

export interface EvalConfig {
  name: string;
  description: string;
}

export interface TrialResult {
  taskId: string;
  config: string;
  // Номер попытки, с 1.
  trial: number;
  tracePath: string;
  // Сессия оборвалась ошибкой.
  failed: boolean;
  checks: CheckResult[];
  // true — все проверки пройдены; false — хоть одна провалена или сессия оборвалась;
  // null — провалов нет, но не всё проверено (судья выключен или ответил не по формату).
  // Такая попытка не засчитывается ни в pass@k, ни в pass^k: «не знаем» — не «прошла».
  passed: boolean | null;
  modelRequests: number;
  toolCalls: number;
  costUsd: number | null;
  durationMs: number;
  // Кэш был прогрет к первому шагу чужой сессией — эта попытка дешевле не из-за конфигурации.
  cacheWarm: boolean;
}

export interface EvalReport {
  kind: 'evalReport';
  version: number;
  set: { name: string; description: string; file: string };
  model: string;
  reasoningEffort: string;
  startedAt: string;
  finishedAt: string | null;
  trials: number;
  configs: EvalConfig[];
  tasks: EvalTask[];
  results: TrialResult[];
  // Трейс судьи — все его запросы за прогон; null — судью не звали.
  judgeTracePath: string | null;
}

export function trialPassed(failed: boolean, checks: readonly CheckResult[]): boolean | null {
  if (failed || checks.some((check) => check.passed === false)) {
    return false;
  }
  return checks.some((check) => check.passed === null) ? null : true;
}

export interface CellSummary {
  taskId: string;
  config: string;
  trials: TrialResult[];
  passes: number;
  // Попытки без вердикта: провалов нет, но и не всё проверено.
  unknown: number;
  passAtK: boolean;
  passHatK: boolean;
}

export interface ConfigSummary {
  config: string;
  tasks: number;
  // Доля задач, решённых хоть раз / во всех попытках.
  passAtK: number;
  passHatK: number;
  // Доля удачных попыток среди всех.
  trialPassRate: number;
  costUsd: number | null;
  medianDurationMs: number;
  medianModelRequests: number;
}

export function summarizeCell(report: EvalReport, taskId: string, config: string): CellSummary {
  const trials = report.results
    .filter((result) => result.taskId === taskId && result.config === config)
    .sort((left, right) => left.trial - right.trial);
  const passes = trials.filter((result) => result.passed === true).length;
  return {
    taskId,
    config,
    trials,
    passes,
    unknown: trials.filter((result) => result.passed === null).length,
    passAtK: passes > 0,
    passHatK: trials.length > 0 && passes === trials.length,
  };
}

export function summarizeConfig(report: EvalReport, config: string): ConfigSummary {
  const cells = report.tasks
    .map((task) => summarizeCell(report, task.id, config))
    .filter((cell) => cell.trials.length > 0);
  const trials = cells.flatMap((cell) => cell.trials);
  const share = (count: number, total: number): number => (total === 0 ? 0 : count / total);
  const costs = trials.map((trial) => trial.costUsd);
  return {
    config,
    tasks: cells.length,
    passAtK: share(cells.filter((cell) => cell.passAtK).length, cells.length),
    passHatK: share(cells.filter((cell) => cell.passHatK).length, cells.length),
    trialPassRate: share(trials.filter((trial) => trial.passed === true).length, trials.length),
    costUsd: costs.some((cost) => cost === null)
      ? null
      : costs.reduce<number>((sum, cost) => sum + (cost ?? 0), 0),
    medianDurationMs: median(trials.map((trial) => trial.durationMs)),
    medianModelRequests: median(trials.map((trial) => trial.modelRequests)),
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) {
    return 0;
  }
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

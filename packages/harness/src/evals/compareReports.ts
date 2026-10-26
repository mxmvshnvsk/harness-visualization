// Сравнение двух прогонов одного набора (этап 8e.3): до изменения и после. По каждой клетке
// «задача × конфигурация» — что стало с долей удачных попыток: позеленела, покраснела или
// осталась как была. Так видно, что изменение починило и что сломало, а не «вроде лучше».
//
// Клетка сравнивается по доле удачных попыток, а не по pass^k: при k = 3 переход с 2 из 3
// на 3 из 3 — тоже изменение, хоть pass@k и не сдвинулся.

import { summarizeCell, type CellSummary, type EvalReport, type ReportTask } from './evalReport.js';

export type CellChange = 'better' | 'worse' | 'same' | 'added' | 'removed';

export interface CellComparison {
  taskId: string;
  config: string;
  before: CellSummary | null;
  after: CellSummary | null;
  change: CellChange;
}

export interface ReportComparison {
  // Задачи обоих прогонов: сначала в порядке «после», затем пропавшие.
  tasks: ReportTask[];
  configs: string[];
  cells: CellComparison[];
  better: number;
  worse: number;
}

export function compareReports(before: EvalReport, after: EvalReport): ReportComparison {
  const tasks = [
    ...after.tasks,
    ...before.tasks.filter((task) => !after.tasks.some((other) => other.id === task.id)),
  ];
  const configs = [...new Set([...after.configs, ...before.configs].map((config) => config.name))];
  const cells = tasks.flatMap((task) =>
    configs.map((config) => compareCell(before, after, task.id, config)),
  );
  return {
    tasks,
    configs,
    cells,
    better: cells.filter((cell) => cell.change === 'better').length,
    worse: cells.filter((cell) => cell.change === 'worse').length,
  };
}

function compareCell(
  before: EvalReport,
  after: EvalReport,
  taskId: string,
  config: string,
): CellComparison {
  const was = presentCell(before, taskId, config);
  const now = presentCell(after, taskId, config);
  return { taskId, config, before: was, after: now, change: changeOf(was, now) };
}

function presentCell(report: EvalReport, taskId: string, config: string): CellSummary | null {
  const cell = summarizeCell(report, taskId, config);
  return cell.trials.length === 0 ? null : cell;
}

function changeOf(before: CellSummary | null, after: CellSummary | null): CellChange {
  if (before === null) {
    return 'added';
  }
  if (after === null) {
    return 'removed';
  }
  const difference = passRate(after) - passRate(before);
  if (difference === 0) {
    return 'same';
  }
  return difference > 0 ? 'better' : 'worse';
}

export function passRate(cell: CellSummary): number {
  return cell.trials.length === 0 ? 0 : cell.passes / cell.trials.length;
}

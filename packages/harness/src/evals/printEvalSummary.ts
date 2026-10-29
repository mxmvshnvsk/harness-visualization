// Сводка прогона evals в терминале: матрица «задача × конфигурация» — по значку на попытку
// (✓ прошла, ✗ нет), затем pass@k, pass^k, цена и время по конфигурациям.

import { styleText } from 'node:util';
import { summarizeCell, summarizeConfig, type EvalReport } from './evalReport.js';
import { EVAL_SUITES } from './evalSet.js';
import { formatFixed } from '../events/formatForConsole.js';

const TASK_WIDTH = 24;

export function printEvalSummary(report: EvalReport): void {
  const configs = report.configs.map((config) => config.name);
  const cellWidth = Math.max(report.trials + 2, ...configs.map((name) => name.length)) + 2;
  console.log(`\n${styleText('bold', 'Задача × конфигурация')}`);
  console.log(
    styleText(
      'dim',
      `  ${'задача'.padEnd(TASK_WIDTH)}${configs.map((name) => name.padEnd(cellWidth)).join('')}`,
    ),
  );
  for (const task of report.tasks) {
    const cells = configs.map((config) => {
      const cell = summarizeCell(report, task.id, config);
      const marks = cell.trials.map((trial) => markOf(trial.passed)).join('');
      return marks.padEnd(cellWidth);
    });
    console.log(`  ${task.id.padEnd(TASK_WIDTH)}${cells.join('')}`);
  }
  console.log(`\n${styleText('bold', `Итоги, k = ${String(report.trials)}`)}`);
  for (const config of configs) {
    console.log(`  ${describeConfig(report, config)}`);
    for (const suite of EVAL_SUITES) {
      if (report.tasks.some((task) => (task.suite ?? 'regression') === suite)) {
        const summary = summarizeConfig(report, config, suite);
        console.log(
          styleText(
            'dim',
            `    ${suite.padEnd(10)} задач ${String(summary.tasks)} · pass@k ${percentOf(summary.passAtK)} · pass^k ${percentOf(summary.passHatK)}`,
          ),
        );
      }
    }
  }
  console.log(
    styleText(
      'dim',
      '  pass@k — задача решена хоть раз из k попыток; pass^k — во всех k. ' +
        'Разница между ними — насколько агент непостоянен. ? — провалов нет, но судья не вынес вердикта.',
    ),
  );
}

function percentOf(share: number): string {
  return `${String(Math.round(share * 100))} %`;
}

export function markOf(passed: boolean | null): string {
  if (passed === null) {
    return '?';
  }
  return passed ? '✓' : '✗';
}

function describeConfig(report: EvalReport, config: string): string {
  const summary = summarizeConfig(report, config);
  const percent = (share: number): string => `${String(Math.round(share * 100))} %`;
  const cost = summary.costUsd === null ? '?' : formatFixed(summary.costUsd, 4);
  return [
    config.padEnd(10),
    `pass@k ${percent(summary.passAtK)}`,
    `pass^k ${percent(summary.passHatK)}`,
    `попыток удачных ${percent(summary.trialPassRate)}`,
    `${cost} USD всего`,
    `медиана ${formatFixed(summary.medianDurationMs / 1000, 1)} с, ${String(summary.medianModelRequests)} запр.`,
  ].join(' · ');
}

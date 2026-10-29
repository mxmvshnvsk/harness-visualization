// Сравнение прогонов (этап 8e.3): выбранный прогон против другого того же набора —
// какие клетки позеленели и какие покраснели, как сдвинулись pass^k, цена и время.

import {
  compareReports,
  summarizeConfig,
  type CellComparison,
  type CellSummary,
  type EvalReport,
} from '@harness-visualization/harness/evals';
import { useState, type ReactElement } from 'react';
import { Segmented } from '../../components/Segmented';
import labStyles from '../rag/RagLab.module.css';
import { SuiteTag } from './EvalTasks';
import { PassHatHint, PassRateHint } from './PassHints';
import styles from './Evals.module.css';
import { resultOf, RESULT_MARKS } from './TrialDetail';
import { useEvalReport } from './useEvals';
import { formatFixed } from '../../text/formatNumber';

const CHANGE_WORDS = {
  better: 'позеленело',
  worse: 'покраснело',
  same: 'как было',
  added: 'новая',
  removed: 'нет в этом прогоне',
} as const;

const FILTERS = [
  { value: 'changed', label: 'что изменилось' },
  { value: 'all', label: 'все клетки' },
] as const;

export function EvalCompare(props: {
  after: EvalReport;
  beforeFile: string;
  version: number;
}): ReactElement {
  const loaded = useEvalReport(props.beforeFile, props.version);
  if (loaded.status !== 'ready') {
    return (
      <section className={labStyles.card}>
        <p className={loaded.status === 'error' ? labStyles.bad : labStyles.hint}>
          {loaded.status === 'loading' ? 'Загружаем прогон для сравнения…' : loaded.message}
        </p>
      </section>
    );
  }
  return <Comparison before={loaded.value} after={props.after} />;
}

function Comparison({ before, after }: { before: EvalReport; after: EvalReport }): ReactElement {
  const [filter, setFilter] = useState<'changed' | 'all'>('changed');
  const comparison = compareReports(before, after);
  // Общие клетки — те, что есть в обоих прогонах; новые и пропавшие сравнивать не с чем.
  const common = comparison.cells.filter((cell) => cell.before !== null && cell.after !== null);
  const shown = common.filter(
    (cell) => filter === 'all' || cell.change === 'better' || cell.change === 'worse',
  );
  return (
    <section className={labStyles.card}>
      <span className={styles.eyebrow}>
        Сравнение · было {before.startedAt.slice(0, 16).replace('T', ' ')} → стало{' '}
        {after.startedAt.slice(0, 16).replace('T', ' ')}
      </span>
      <h2 className={styles.heading}>
        Позеленело {comparison.better}, покраснело {comparison.worse}
      </h2>
      {common.length < comparison.cells.length && (
        <p className={styles.note}>
          {common.length === 0
            ? 'У прогонов нет общих клеток «задача × конфигурация» — сравнивать нечего. Сравнивают прогоны одного набора: до изменения и после.'
            : `Сравниваются только общие клетки: ${String(common.length)} из ${String(comparison.cells.length)}.`}
        </p>
      )}
      {common.length > 0 && (
        <CommonPart
          before={before}
          after={after}
          common={common}
          shown={shown}
          tasks={comparison.tasks}
          filter={filter}
          onFilter={setFilter}
        />
      )}
    </section>
  );
}

// Итоги и таблица — только по общим клеткам: иначе «было» и «стало» считали бы разные задачи.
function CommonPart(props: {
  before: EvalReport;
  after: EvalReport;
  common: CellComparison[];
  shown: CellComparison[];
  tasks: EvalReport['tasks'];
  filter: 'changed' | 'all';
  onFilter: (value: 'changed' | 'all') => void;
}): ReactElement {
  const { common, shown, filter } = props;
  const ids = new Set(common.map((cell) => cell.taskId));
  const only = (report: EvalReport): EvalReport => ({
    ...report,
    tasks: report.tasks.filter((task) => ids.has(task.id)),
  });
  const configs = [...new Set(common.map((cell) => cell.config))];
  return (
    <>
      <ConfigShift before={only(props.before)} after={only(props.after)} configs={configs} />
      <div className={styles.toolbar}>
        <Segmented
          label="Какие клетки"
          options={FILTERS}
          value={filter}
          onChange={props.onFilter}
          size="small"
        />
      </div>
      {shown.length === 0 ? (
        <p className={labStyles.hint}>
          Ни одна общая клетка не изменилась: доля удачных попыток везде та же.
        </p>
      ) : (
        <ChangeTable cells={shown} tasks={props.tasks} />
      )}
    </>
  );
}

// pass^k, цена и медиана времени по конфигурациям: было → стало.
function ConfigShift(props: {
  before: EvalReport;
  after: EvalReport;
  configs: string[];
}): ReactElement {
  const percent = (share: number): string => `${String(Math.round(share * 100))} %`;
  const cost = (value: number | null): string => (value === null ? '?' : formatFixed(value, 4));
  return (
    <div className={styles.totals}>
      {props.configs.map((config) => {
        const was = summarizeConfig(props.before, config);
        const now = summarizeConfig(props.after, config);
        return (
          <div key={config} className={styles.total}>
            <span className={styles.mono}>{config}</span>
            <span className={styles.small}>
              <PassHatHint trials={props.after.trials} /> {percent(was.passHatK)} →{' '}
              <b>{percent(now.passHatK)}</b> · <PassRateHint /> {percent(was.trialPassRate)} →{' '}
              <b>{percent(now.trialPassRate)}</b>
            </span>
            <span className={`${styles.small} ${styles.muted}`}>
              {cost(was.costUsd)} → {cost(now.costUsd)} USD всего · медиана{' '}
              {formatFixed(was.medianDurationMs / 1000, 1)} →{' '}
              {formatFixed(now.medianDurationMs / 1000, 1)} с
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ChangeTable(props: { cells: CellComparison[]; tasks: EvalReport['tasks'] }): ReactElement {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>задача</th>
            <th>конфигурация</th>
            <th>было</th>
            <th>стало</th>
            <th>итог</th>
          </tr>
        </thead>
        <tbody>
          {props.cells.map((cell) => {
            const task = props.tasks.find((item) => item.id === cell.taskId);
            return (
              <tr key={`${cell.taskId}:${cell.config}`} data-change={cell.change}>
                <td>
                  <SuiteTag suite={task?.suite} /> {task?.question ?? cell.taskId}
                </td>
                <td className={styles.number}>{cell.config}</td>
                <td>
                  <Marks cell={cell.before} />
                </td>
                <td>
                  <Marks cell={cell.after} />
                </td>
                <td className={styles.change} data-change={cell.change}>
                  {CHANGE_WORDS[cell.change]}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Marks({ cell }: { cell: CellSummary | null }): ReactElement {
  if (cell === null) {
    return <span className={styles.muted}>—</span>;
  }
  return (
    <span className={styles.cells}>
      {cell.trials.map((trial) => {
        const result = resultOf(trial.passed);
        return (
          <span key={trial.trial} className={styles.cell} data-result={result} data-static="">
            {RESULT_MARKS[result]}
          </span>
        );
      })}
    </span>
  );
}

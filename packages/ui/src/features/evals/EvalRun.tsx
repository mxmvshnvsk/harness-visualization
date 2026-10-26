// «Прогон»: настоящий отчёт pnpm run eval — итоги по конфигурациям, матрица
// «задача × попытка» и попытка крупно по клику на клетку.

import {
  EVAL_SUITES,
  summarizeCell,
  summarizeConfig,
  type EvalReport,
} from '@harness-visualization/harness/evals';
import type { EvalReportSummary } from '@harness-visualization/server';
import { useState, type ReactElement } from 'react';
import { Button } from '../../components/Button';
import labStyles from '../rag/RagLab.module.css';
import styles from './Evals.module.css';
import { EvalCompare } from './EvalCompare';
import { SuiteTag } from './EvalTasks';
import { PassAtHint, PassHatHint, PassRateHint } from './PassHints';
import { resultOf, RESULT_MARKS, TrialDetail, type CellRef } from './TrialDetail';
import { useEvalReport } from './useEvals';

interface EvalRunProps {
  reports: EvalReportSummary[];
  onOpenTrace: (file: string) => void;
}

export function EvalRun({ reports, onOpenTrace }: EvalRunProps): ReactElement {
  const [file, setFile] = useState(reports[0]?.file ?? null);
  if (file === null) {
    return (
      <section className={labStyles.card}>
        <p className={labStyles.hint}>
          Прогонов ещё нет. Запустите <span className={styles.mono}>pnpm run eval</span> — отчёт
          появится в <span className={styles.mono}>traces/evals/</span>.
        </p>
      </section>
    );
  }
  return (
    <ReportView
      key={file}
      reports={reports}
      file={file}
      onChoose={setFile}
      onOpenTrace={onOpenTrace}
    />
  );
}

function ReportView(props: {
  reports: EvalReportSummary[];
  file: string;
  onChoose: (file: string) => void;
  onOpenTrace: (file: string) => void;
}): ReactElement {
  const [version, setVersion] = useState(0);
  const loaded = useEvalReport(props.file, version);
  const [cell, setCell] = useState<CellRef | null>(null);
  const [compareFile, setCompareFile] = useState('');
  const reload = (): void => {
    setVersion((value) => value + 1);
  };
  return (
    <>
      <section className={labStyles.card}>
        <div className={styles.toolbar}>
          <select
            className={styles.select}
            aria-label="Прогон"
            value={props.file}
            onChange={(event) => {
              props.onChoose(event.target.value);
            }}
          >
            {props.reports.map((report) => (
              <option key={report.file} value={report.file}>
                {describeReport(report)}
              </option>
            ))}
          </select>
          <CompareSelect
            reports={props.reports}
            file={props.file}
            value={compareFile}
            onChange={setCompareFile}
          />
          <Button variant="quiet" onClick={reload}>
            Перечитать
          </Button>
        </div>
        {loaded.status === 'ready' ? (
          <RunSummary report={loaded.value} cell={cell} onCell={setCell} />
        ) : (
          <p className={loaded.status === 'error' ? labStyles.bad : labStyles.hint}>
            {loaded.status === 'loading' ? 'Загружаем отчёт…' : loaded.message}
          </p>
        )}
      </section>
      {loaded.status === 'ready' && compareFile !== '' && (
        <EvalCompare after={loaded.value} beforeFile={compareFile} version={version} />
      )}
      {loaded.status === 'ready' && cell !== null && (
        <TrialDetail report={loaded.value} cell={cell} onOpenTrace={props.onOpenTrace} />
      )}
    </>
  );
}

// … — ответа ещё нет: попыток меньше k.
function markOf(value: boolean | null): string {
  if (value === null) {
    return '…';
  }
  return value ? '✓' : '✗';
}

// С чем сравнить: другой прогон — «было», выбранный — «стало».
function CompareSelect(props: {
  reports: EvalReportSummary[];
  file: string;
  value: string;
  onChange: (file: string) => void;
}): ReactElement | null {
  const others = props.reports.filter((report) => report.file !== props.file);
  if (others.length === 0) {
    return null;
  }
  return (
    <select
      className={styles.select}
      aria-label="Сравнить с прогоном"
      value={props.value}
      onChange={(event) => {
        props.onChange(event.target.value);
      }}
    >
      <option value="">сравнить с… (было)</option>
      {others.map((report) => (
        <option key={report.file} value={report.file}>
          {describeReport(report)}
        </option>
      ))}
    </select>
  );
}

function describeReport(report: EvalReportSummary): string {
  const when = report.startedAt.slice(0, 16).replace('T', ' ');
  const progress =
    report.finishedAt === null && report.done < report.planned
      ? ` · идёт: ${String(report.done)} из ${String(report.planned)}`
      : '';
  const example = report.example ? ' · пример' : '';
  return `${when} · ${report.setName} · ${report.configs.join(', ')} · k = ${String(report.trials)}${progress}${example}`;
}

function RunSummary(props: {
  report: EvalReport;
  cell: CellRef | null;
  onCell: (cell: CellRef) => void;
}): ReactElement {
  const { report } = props;
  const planned = report.tasks.length * report.configs.length * report.trials;
  return (
    <>
      <span className={styles.eyebrow}>
        Прогон · {report.tasks.length} задач × {report.trials} попыток × {report.configs.length}{' '}
        конф. · {report.model} · effort {report.reasoningEffort}
      </span>
      <h2 className={styles.heading}>Что решает агент и насколько стабильно</h2>
      {report.results.length < planned && (
        <p className={styles.note}>
          Прогон {report.finishedAt === null ? 'идёт' : 'прерван'}: сделано {report.results.length}{' '}
          попыток из {planned}. Итоги — по сделанным.
        </p>
      )}
      <ConfigTotals report={report} />
      <Matrix report={report} cell={props.cell} onCell={props.onCell} />
    </>
  );
}

const percent = (share: number): string => `${String(Math.round(share * 100))} %`;

function ConfigTotals({ report }: { report: EvalReport }): ReactElement {
  return (
    <div className={styles.totals}>
      {report.configs.map((config) => {
        const summary = summarizeConfig(report, config.name);
        return (
          <div key={config.name} className={styles.total}>
            <span className={styles.mono}>
              {config.name} · {config.description}
            </span>
            <div className={styles.big}>
              <div>
                <b>{percent(summary.trialPassRate)}</b>
                <small>
                  <PassRateHint />
                </small>
              </div>
              <div>
                <b>{percent(summary.passAtK)}</b>
                <small>
                  <PassAtHint trials={report.trials} />
                </small>
              </div>
              <div>
                <b>{percent(summary.passHatK)}</b>
                <small>
                  <PassHatHint trials={report.trials} />
                </small>
              </div>
            </div>
            <SuiteLines report={report} config={config.name} />
            <span className={`${styles.small} ${styles.muted}`}>
              {summary.costUsd === null ? 'цена неизвестна' : `${summary.costUsd.toFixed(4)} USD`}{' '}
              всего · медиана {(summary.medianDurationMs / 1000).toFixed(1)} с и{' '}
              {summary.medianModelRequests} запр. на попытку
            </span>
          </div>
        );
      })}
    </div>
  );
}

// pass^k отдельно по видам задач: общий процент прячет, что трудное не решается.
function SuiteLines({ report, config }: { report: EvalReport; config: string }): ReactElement {
  const suites = EVAL_SUITES.filter((suite) =>
    report.tasks.some((task) => (task.suite ?? 'regression') === suite),
  );
  return (
    <span className={`${styles.small} ${styles.muted}`}>
      {suites
        .map((suite) => {
          const summary = summarizeConfig(report, config, suite);
          return `${suite}: pass^${String(report.trials)} ${percent(summary.passHatK)} из ${String(summary.tasks)} задач`;
        })
        .join(' · ')}
    </span>
  );
}

function Matrix(props: {
  report: EvalReport;
  cell: CellRef | null;
  onCell: (cell: CellRef) => void;
}): ReactElement {
  const { report } = props;
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>задача</th>
            {report.configs.map((config) => (
              <th key={config.name} colSpan={2}>
                {config.name}: попытки · <PassAtHint trials={report.trials} /> /{' '}
                <PassHatHint trials={report.trials} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {report.tasks.map((task) => (
            <tr key={task.id}>
              <td>
                <SuiteTag suite={task.suite} /> {task.question}
              </td>
              {report.configs.map((config) => (
                <ConfigCells
                  key={config.name}
                  report={report}
                  taskId={task.id}
                  config={config.name}
                  cell={props.cell}
                  onCell={props.onCell}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Клетки одной конфигурации в строке задачи: по кнопке на попытку и pass@k / pass^k.
function ConfigCells(props: {
  report: EvalReport;
  taskId: string;
  config: string;
  cell: CellRef | null;
  onCell: (cell: CellRef) => void;
}): ReactElement {
  const { taskId, config, cell } = props;
  const summary = summarizeCell(props.report, taskId, config);
  return (
    <>
      <td>
        <div className={styles.cells}>
          {summary.trials.map((trial) => {
            const result = resultOf(trial.passed);
            return (
              <button
                key={trial.trial}
                type="button"
                className={styles.cell}
                data-result={result}
                aria-pressed={
                  cell?.taskId === taskId && cell.config === config && cell.trial === trial.trial
                }
                aria-label={`${taskId}, ${config}, попытка ${String(trial.trial)}`}
                onClick={() => {
                  props.onCell({ taskId, config, trial: trial.trial });
                }}
              >
                {RESULT_MARKS[result]}
              </button>
            );
          })}
        </div>
      </td>
      <td className={styles.number}>
        {`${markOf(summary.passAtK)} / ${markOf(summary.passHatK)}`}
      </td>
    </>
  );
}

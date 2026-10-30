// Попытка крупно: ответ агента, каждая проверка с тем, что нашли на деле, и ссылка в трейс —
// провалившуюся проверку можно открыть и понять почему.

import {
  evalTrialModelLabel,
  type CheckResult,
  type EvalReport,
  type TrialResult,
  type ReportTask,
} from '@harness-visualization/harness/evals';
import type { ReactElement } from 'react';
import { Button } from '../../components/Button';
import { MarkdownView } from '../../help/MarkdownView';
import labStyles from '../rag/RagLab.module.css';
import { CheckTag, graderOf } from './EvalTasks';
import styles from './Evals.module.css';
import { formatFixed } from '../../text/formatNumber';

export interface CellRef {
  taskId: string;
  config: string;
  trial: number;
}

export type TrialOutcome = 'pass' | 'fail' | 'unknown';

export const RESULT_MARKS: Record<TrialOutcome, string> = { pass: '✓', fail: '✗', unknown: '?' };

const RESULT_WORDS: Record<TrialOutcome, string> = {
  pass: 'прошла',
  fail: 'не прошла',
  unknown: 'провалов нет, но не всё проверено',
};

export function resultOf(passed: boolean | null): TrialOutcome {
  if (passed === null) {
    return 'unknown';
  }
  return passed ? 'pass' : 'fail';
}

export function TrialDetail(props: {
  report: EvalReport;
  cell: CellRef;
  onOpenTrace: (file: string) => void;
}): ReactElement | null {
  const { report, cell } = props;
  const task = report.tasks.find((item) => item.id === cell.taskId);
  const trial = report.results.find(
    (item) =>
      item.taskId === cell.taskId && item.config === cell.config && item.trial === cell.trial,
  );
  if (task === undefined || trial === undefined) {
    return null;
  }
  const traceFile = trial.tracePath.split('/').at(-1) ?? trial.tracePath;
  const cost = trial.costUsd === null ? 'цена неизвестна' : `${formatFixed(trial.costUsd, 6)} USD`;
  return (
    <section className={labStyles.card}>
      <TrialIdentity report={report} task={task} trial={trial} />
      <div className={styles.pair}>
        <div className={styles.results}>
          <span className={`${styles.small} ${styles.muted}`}>
            {trial.failed ? 'Сессия оборвалась ошибкой. ' : ''}
            {trial.modelRequests} запр. к модели · {trial.toolCalls} вызовов тулов · {cost} ·{' '}
            {formatFixed(trial.durationMs / 1000, 1)} с
            {trial.cacheWarm ? ' · кэш прогрет чужой сессией' : ''}
          </span>
          <div className={styles.answer}>
            {trial.answer === undefined || trial.answer === null ? (
              <span className={styles.muted}>Ответа нет.</span>
            ) : (
              <MarkdownView text={trial.answer} />
            )}
          </div>
          {trial.traceAvailable === false ? (
            <p className={`${styles.small} ${styles.muted}`}>
              Трейса попытки здесь нет: в примерах из репозитория лежит только отчёт с ответами.
            </p>
          ) : (
            <div>
              <Button
                variant="quiet"
                onClick={() => {
                  props.onOpenTrace(traceFile);
                }}
              >
                Открыть трейс попытки →
              </Button>
            </div>
          )}
        </div>
        <CheckList checks={trial.checks} />
      </div>
    </section>
  );
}

function CheckList({ checks }: { checks: CheckResult[] }): ReactElement {
  return (
    <div className={styles.results}>
      {checks.map((check) => {
        const result = resultOf(check.passed);
        return (
          <div key={check.label} className={styles.result} data-result={result}>
            <span className={styles.icon}>{RESULT_MARKS[result]}</span>
            <div>
              <CheckTag kind={graderOf(check)} /> {check.label}
              <small>{check.detail}</small>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TrialIdentity({
  report,
  task,
  trial,
}: {
  report: EvalReport;
  task: ReportTask;
  trial: TrialResult;
}): ReactElement {
  const outcome = resultOf(trial.passed);
  return (
    <>
      <span className={styles.eyebrow}>Попытка крупно</span>
      <h2 className={styles.heading}>
        «{task.question}» · {trial.config} · попытка {trial.trial} — {RESULT_WORDS[outcome]}
      </h2>
      <p className={styles.note}>{evalTrialModelLabel(report, trial)}</p>
    </>
  );
}

// Бюджет prompt (этап 6.2): из чего состоит запрос и сколько ему отведено. Разбивка —
// оценка харнесса (≈), итог провайдера — точный; рядом видно, насколько оценка ошиблась.

import type { PromptBudget } from '@harness-visualization/harness';
import type { CSSProperties, ReactElement } from 'react';
import { Term } from '../../help/HelpLinks';
import { PARTS, partTokens } from '../context/contextScale';
import styles from './Budget.module.css';

interface BudgetBlockProps {
  budget: PromptBudget;
  // Точный размер prompt из usage ответа; null — ответа ещё нет.
  exactTokens: number | null;
}

export function BudgetBlock({ budget, exactTokens }: BudgetBlockProps): ReactElement {
  const { estimate, limitTokens, thresholdTokens } = budget;
  // Шкала — до лимита, а если prompt больше — до prompt: перебор тоже видно. У чужой записи
  // лимита нет (0) — шкала до самого prompt.
  const scale = Math.max(limitTokens, estimate.total, 1);
  const hasLimit = limitTokens > 0;
  return (
    <section className={styles.budget} aria-label="Бюджет prompt">
      <div className={styles.head}>
        <span className={styles.title}>
          <Term topic="context-budget">Бюджет prompt</Term> ≈ {format(estimate.total)}
          {hasLimit
            ? ` из ${format(limitTokens)} · пресет ${budget.preset}`
            : ' · лимита в записи нет'}
        </span>
        {hasLimit && (
          <span className={styles.share}>
            {String(Math.round((estimate.total / limitTokens) * 100))} %
          </span>
        )}
      </div>
      <div className={styles.track} role="img" aria-label={describe(budget)}>
        {PARTS.map((part) => (
          <span
            key={part.key}
            className={styles.part}
            style={{
              width: `${String((partTokens(estimate, part.key) / scale) * 100)}%`,
              background: part.color,
            }}
          />
        ))}
        {hasLimit && (
          <span
            className={styles.threshold}
            style={{ left: `${String((thresholdTokens / scale) * 100)}%` }}
          />
        )}
      </div>
      <ul className={styles.legend}>
        {PARTS.map((part) => (
          <li key={part.key} style={{ '--swatch': part.color } as CSSProperties}>
            {part.label} ≈ {format(partTokens(estimate, part.key))}
          </li>
        ))}
      </ul>
      <ReconstructedNote budget={budget} />
      <p className={styles.note}>
        Разбивка — оценка: символы JSON запроса ÷ {budget.charsPerToken.toLocaleString('ru-RU')}.{' '}
        {exactTokens === null
          ? 'Точное число придёт в usage ответа.'
          : `Точно, по usage ответа, — ${format(exactTokens)} (оценка ошиблась на ${String(errorPercent(estimate.total, exactTokens))} %).`}{' '}
        {hasLimit &&
          `Пунктир — порог ${format(thresholdTokens)}: с него харнесс начнёт освобождать место.`}
      </p>
    </section>
  );
}

// Чужая запись (адаптер, этап 9.4): тела запроса нет, бюджет собран заново.
function ReconstructedNote({ budget }: { budget: PromptBudget }): ReactElement | null {
  if (budget.reconstructed === undefined) {
    return null;
  }
  return (
    <p className={styles.note}>
      Восстановлено по чужой записи: тела запроса в ней нет, история собрана заново. В system ≈{' '}
      {format(budget.reconstructed.hiddenTokens)} — остаток до настоящего input: system prompt и
      описания тулов того харнесса, по отдельности их не разделить.
    </p>
  );
}

function errorPercent(estimate: number, exact: number): number {
  return exact === 0 ? 0 : Math.round((Math.abs(estimate - exact) / exact) * 100);
}

function describe({ estimate, limitTokens }: PromptBudget): string {
  return `prompt примерно ${format(estimate.total)} токенов из ${format(limitTokens)}`;
}

function format(value: number): string {
  return value.toLocaleString('ru-RU');
}

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
  // Шкала — до лимита, а если prompt больше — до prompt: перебор тоже видно.
  const scale = Math.max(limitTokens, estimate.total);
  return (
    <section className={styles.budget} aria-label="Бюджет prompt">
      <div className={styles.head}>
        <span className={styles.title}>
          <Term topic="context-budget">Бюджет prompt</Term> ≈ {format(estimate.total)} из{' '}
          {format(limitTokens)} · пресет {budget.preset}
        </span>
        <span className={styles.share}>
          {String(Math.round((estimate.total / limitTokens) * 100))} %
        </span>
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
        <span
          className={styles.threshold}
          style={{ left: `${String((thresholdTokens / scale) * 100)}%` }}
        />
      </div>
      <ul className={styles.legend}>
        {PARTS.map((part) => (
          <li key={part.key} style={{ '--swatch': part.color } as CSSProperties}>
            {part.label} ≈ {format(partTokens(estimate, part.key))}
          </li>
        ))}
      </ul>
      <p className={styles.note}>
        Разбивка — оценка: символы JSON запроса ÷ {budget.charsPerToken.toLocaleString('ru-RU')}.{' '}
        {exactTokens === null
          ? 'Точное число придёт в usage ответа.'
          : `Точно, по usage ответа, — ${format(exactTokens)} (оценка ошиблась на ${String(errorPercent(estimate.total, exactTokens))} %).`}{' '}
        Пунктир — порог {format(thresholdTokens)}: с него харнесс начнёт освобождать место.
      </p>
    </section>
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

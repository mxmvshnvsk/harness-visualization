// Самый большой prompt каждого агента — оценкой харнесса, рядом лимит пресета. У каждого своя
// история, поэтому и свой prompt; без субагентов главный читал бы всё сам — это покажет
// сравнение прогонов (этап 9), в записи этого числа нет.

import type { ReactElement } from 'react';
import type { AgentsView } from '../../projections/projectAgents';
import { agentName, formatTokens } from './agentFormat';
import styles from './Agents.module.css';

export function BudgetBars({ view }: { view: AgentsView }): ReactElement | null {
  const lanes = view.lanes.filter((lane) => lane.maxPrompt !== null);
  if (lanes.length === 0) {
    return null;
  }
  const scale = Math.max(
    view.limitTokens ?? 0,
    ...lanes.map((lane) => lane.maxPrompt?.tokens ?? 0),
  );
  return (
    <section className={styles.card}>
      <h2 className={styles.title}>Самый большой prompt у каждого</h2>
      <p className={styles.muted}>
        У каждого агента своя история. Сколько отправил бы модели главный, читай он всё сам, в
        записи не узнать — это покажет сравнение прогонов.
      </p>
      <div className={styles.bars}>
        {lanes.map((lane) => {
          const tokens = lane.maxPrompt?.tokens ?? 0;
          const step = lane.maxPrompt?.step ?? null;
          return (
            <div key={lane.id} className={styles.bar} data-color={lane.color}>
              <span>
                <span className={styles.swatch} aria-hidden="true" />
                {agentName(lane.id)}
                {step === null ? '' : ` · шаг ${String(step)}`}
              </span>
              <span className={styles.barTrack}>
                <span
                  className={styles.barFill}
                  style={{ width: `${String((tokens / scale) * 100)}%` }}
                />
              </span>
              <span className={styles.num}>≈{formatTokens(tokens)}</span>
            </div>
          );
        })}
        {view.limitTokens !== null && (
          <div className={styles.bar}>
            <span className={styles.muted}>лимит пресета</span>
            <span className={styles.limitLine} />
            <span className={styles.num}>{formatTokens(view.limitTokens)}</span>
          </div>
        )}
      </div>
    </section>
  );
}

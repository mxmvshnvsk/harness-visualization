// «Когда гоняют»: evals — тесты для поведения агента; regression и capability.

import type { ReactElement } from 'react';
import { ExternalLink } from '../../components/ExternalLink';
import labStyles from '../rag/RagLab.module.css';
import { WHEN_STEPS } from './evalContent';
import styles from './Evals.module.css';

export function EvalWhen(): ReactElement {
  return (
    <section className={labStyles.card}>
      <span className={styles.eyebrow}>Когда гоняют</span>
      <h2 className={styles.heading}>Evals — это тесты для поведения агента</h2>
      <div className={styles.when}>
        {WHEN_STEPS.map(([title, text]) => (
          <div key={title} className={styles.box}>
            <b>{title}</b>
            <span className={styles.muted}>{text}</span>
          </div>
        ))}
      </div>
      <div className={styles.pair}>
        <div className={styles.box}>
          <b>Regression — «не сломали ли»</b>
          <span className={styles.muted}>
            Задачи, которые агент уже решает. Доля успехов должна быть около 100 %; падение —
            сигнал, что изменение что-то сломало. Пример: «сколько дней можно отдыхать в году».
          </span>
        </div>
        <div className={styles.box}>
          <b>Capability — «чему ещё не научился»</b>
          <span className={styles.muted}>
            Трудные задачи, начинают с низкой доли успехов — это цель для улучшений. Пример:
            противоречие регламента и FAQ на «удалёнке».
          </span>
        </div>
      </div>
      <p className={styles.note} data-teaching>
        Источник терминов и подхода — статья Anthropic{' '}
        <ExternalLink href="https://anthropic.com/engineering/demystifying-evals-for-ai-agents">
          Demystifying evals for AI agents
        </ExternalLink>
        : task, trial, grader, transcript, pass@k и pass^k, regression и capability evals.
      </p>
    </section>
  );
}

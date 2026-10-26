// «Набор задач»: задачи из evals/*.json — вопрос, откуда задача и чем её проверяют.

import { describeCheck, type EvalCheck, type EvalSet } from '@harness-visualization/harness/evals';
import type { ReactElement } from 'react';
import labStyles from '../rag/RagLab.module.css';
import styles from './Evals.module.css';

export function EvalTasks({ sets }: { sets: { file: string; set: EvalSet }[] }): ReactElement {
  if (sets.length === 0) {
    return (
      <section className={labStyles.card}>
        <p className={labStyles.hint}>В папке evals/ нет наборов задач.</p>
      </section>
    );
  }
  return (
    <>
      {sets.map(({ file, set }) => (
        <section key={file} className={labStyles.card}>
          <span className={styles.eyebrow}>
            Набор задач · <span className={styles.mono}>{file}</span>
          </span>
          <h2 className={styles.heading}>{set.description}</h2>
          <div className={styles.legend}>
            <CheckTag kind="code" /> проверка кодом — по трейсу попытки
            <CheckTag kind="judge" /> модель-судья — по рубрике
          </div>
          <div className={styles.tasks}>
            {set.tasks.map((task) => (
              <article key={task.id} className={styles.task}>
                <q>{task.question}</q>
                <span className={`${styles.mono} ${styles.muted}`}>{task.id}</span>
                <ul className={styles.checks}>
                  {task.checks.map((check) => (
                    <li key={describeCheck(check)}>
                      <CheckTag kind={graderOf(check)} />
                      <span>{check.kind === 'judge' ? check.rubric : describeCheck(check)}</span>
                    </li>
                  ))}
                </ul>
                <p className={`${styles.small} ${styles.muted}`}>откуда: {task.origin}</p>
              </article>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

export function graderOf(check: { kind: EvalCheck['kind'] }): 'code' | 'judge' {
  return check.kind === 'judge' ? 'judge' : 'code';
}

export function CheckTag({ kind }: { kind: 'code' | 'judge' }): ReactElement {
  return (
    <span className={styles.tag} data-kind={kind}>
      {kind === 'judge' ? 'судья' : 'кодом'}
    </span>
  );
}

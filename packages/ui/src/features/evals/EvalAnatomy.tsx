// «Из чего eval»: цепочка задача → попытки → трейсы → проверки → итог и два харнесса.

import { useState, type ReactElement } from 'react';
import labStyles from '../rag/RagLab.module.css';
import { STAGES, type StageId } from './evalContent';
import styles from './Evals.module.css';

export function EvalAnatomy(): ReactElement {
  return (
    <>
      <Pipeline />
      <TwoHarnesses />
    </>
  );
}

function Pipeline(): ReactElement {
  const [chosen, setChosen] = useState<StageId>('task');
  const stage = STAGES.find((item) => item.id === chosen) ?? STAGES[0];
  return (
    <section className={labStyles.card}>
      <span className={styles.eyebrow}>Из чего eval</span>
      <h2 className={styles.heading}>Задача → попытки → трейсы → проверки → итог</h2>
      <div className={styles.pipe}>
        {STAGES.map((item, index) => (
          <button
            key={item.id}
            type="button"
            className={styles.stage}
            aria-pressed={item.id === chosen}
            onClick={() => {
              setChosen(item.id);
            }}
          >
            <small>
              {index + 1} · {item.en}
            </small>
            <b>{item.name}</b>
          </button>
        ))}
      </div>
      <div className={styles.explain}>
        <div>
          <h3 className={styles.heading}>{stage.name}</h3>
          <p className={styles.small}>{stage.text}</p>
        </div>
        <ul>
          {stage.more.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function TwoHarnesses(): ReactElement {
  return (
    <section className={labStyles.card}>
      <span className={styles.eyebrow}>Два харнесса</span>
      <h2 className={styles.heading}>Eval проверяет модель и харнесс вместе</h2>
      <div className={styles.pair}>
        <div className={styles.box}>
          <b>Харнесс агента</b>
          <span>
            То, что мы визуализируем: цикл, контекст, тулы, политика. Меняем его — меняется
            поведение агента.
          </span>
        </div>
        <div className={styles.box}>
          <b>Харнесс evals</b>
          <span>
            Программа, которая гоняет задачи, пишет трейсы, запускает проверки и сводит итог: у нас
            — <span className={styles.mono}>pnpm run eval</span>, набор задач — в{' '}
            <span className={styles.mono}>evals/kedr.json</span>.
          </span>
        </div>
      </div>
      <p className={styles.note} data-teaching>
        Поменяли инструкцию, способ поиска или модель — прогнали тот же набор задач. Так видно, что
        изменение починило и что сломало, а не «вроде стало лучше».
      </p>
    </section>
  );
}

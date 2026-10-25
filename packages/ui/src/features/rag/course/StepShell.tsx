// Каркас шага маршрута: вопрос, объяснение, опыт, «обратите внимание», вывод и переход дальше.

import type { ReactElement, ReactNode } from 'react';
import styles from '../RagLab.module.css';
import { COURSE_STEPS } from './courseContent';

interface StepShellProps {
  index: number;
  question: string;
  prose: ReactNode;
  lab: ReactNode;
  notice: ReactNode;
  takeaway: ReactNode;
  onStep: (index: number) => void;
}

export function StepShell(props: StepShellProps): ReactElement {
  const next = COURSE_STEPS[props.index + 1];
  return (
    <section className={styles.step} aria-labelledby="step-title">
      <span className={styles.eyebrow}>
        шаг {props.index + 1} из {COURSE_STEPS.length}
      </span>
      <h2 id="step-title" className={styles.question}>
        {props.question}
      </h2>
      <div className={styles.prose}>{props.prose}</div>
      {props.lab}
      <div className={styles.notice}>
        <b>Обратите внимание</b>
        <div>{props.notice}</div>
      </div>
      <div className={styles.takeaway}>
        <b>Вывод</b>
        <div>{props.takeaway}</div>
      </div>
      {next === undefined ? (
        <p className={styles.hint}>
          Это весь маршрут. Дальше — вкладка «Данные»: свой запрос на карте базы и в трёх поисках. А
          как искал агент в любой записанной сессии — вид «RAG» у открытого трейса.
        </p>
      ) : (
        <button
          type="button"
          className={styles.next}
          onClick={() => {
            props.onStep(props.index + 1);
          }}
        >
          Дальше: {next.title.toLowerCase()} →
        </button>
      )}
    </section>
  );
}

// Термин с подсказкой: вводится после того, как понятно, что он называет.
export function CourseTerm({ tip, children }: { tip: string; children: ReactNode }): ReactElement {
  return (
    <span className={styles.term} tabIndex={0} data-tip={tip}>
      {children}
    </span>
  );
}

// Лабораторный опыт внутри шага: заголовок, подсказка, содержимое.
export function Lab(props: { title: string; hint: ReactNode; children: ReactNode }): ReactElement {
  return (
    <div className={styles.lab}>
      <h3 className={styles.labTitle}>{props.title}</h3>
      <p className={styles.hint}>{props.hint}</p>
      {props.children}
    </div>
  );
}

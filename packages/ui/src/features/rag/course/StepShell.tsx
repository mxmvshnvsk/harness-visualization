// Каркас шага маршрута: вопрос, объяснение, опыт, «обратите внимание», вывод и переход дальше.

import type { CSSProperties, ReactElement, ReactNode } from 'react';
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
  // Шаги маршрута; по умолчанию — маршрут лаборатории RAG.
  steps?: readonly { title: string }[];
  // Что сказать после последнего шага.
  ending?: ReactNode;
}

export function StepShell(props: StepShellProps): ReactElement {
  const steps = props.steps ?? COURSE_STEPS;
  const next = steps[props.index + 1];
  return (
    <section className={styles.step} aria-labelledby="step-title">
      <span className={styles.eyebrow}>
        шаг {props.index + 1} из {steps.length}
      </span>
      <h2 id="step-title" className={styles.question}>
        {props.question}
      </h2>
      <div className={styles.prose}>{props.prose}</div>
      {props.lab}
      <div className={styles.notice} data-teaching>
        <b>Обратите внимание</b>
        <div>{props.notice}</div>
      </div>
      <div className={styles.takeaway} data-teaching>
        <b>Вывод</b>
        <div>{props.takeaway}</div>
      </div>
      {next === undefined ? (
        <p className={styles.hint}>{props.ending ?? RAG_ENDING}</p>
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

const RAG_ENDING = (
  <>
    Это весь маршрут. Дальше — вкладка «Данные»: свой запрос на карте базы и в трёх поисках. А как
    искал агент в любой записанной сессии — вид «RAG» у открытого трейса.
  </>
);

// Навигация по шагам маршрута: номер и название, текущий выделен.
export function CourseNav(props: {
  steps: readonly { id: string; title: string }[];
  current: number;
  onStep: (index: number) => void;
}): ReactElement {
  return (
    <ol
      className={styles.steps}
      style={{ '--count': props.steps.length } as CSSProperties}
      aria-label="Шаги маршрута"
    >
      {props.steps.map((step, index) => (
        <li key={step.id}>
          <button
            type="button"
            aria-current={index === props.current ? 'step' : undefined}
            onClick={() => {
              props.onStep(index);
            }}
          >
            <small>шаг {index + 1}</small>
            <span>{step.title}</span>
          </button>
        </li>
      ))}
    </ol>
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

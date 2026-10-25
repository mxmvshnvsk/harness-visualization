// Лаборатория RAG (этап 8b): учебный маршрут о том, как агент ищет в базе знаний.
// Шаги идут по порядку — от «зачем искать» к проверке ответа; каждый опирается на настоящие
// данные базы «Кедр Софт» с сервера (/api/rag).

import type { LabBase } from '@harness-visualization/mcp-server/lab';
import { useState, type ReactElement } from 'react';
import { ThemeSwitch } from '../../app/ThemeSwitch';
import { Button } from '../../components/Button';
import { COURSE_STEPS } from './course/courseContent';
import { StepCheck } from './course/StepCheck';
import { StepChunks } from './course/StepChunks';
import { StepClose } from './course/StepClose';
import { StepMethods } from './course/StepMethods';
import { StepVectors } from './course/StepVectors';
import { StepWhy } from './course/StepWhy';
import styles from './RagLab.module.css';
import { useRagBase } from './useRagData';

export function RagLab({ onBack }: { onBack: () => void }): ReactElement {
  const base = useRagBase();
  const [step, setStep] = useState(0);
  const go = (index: number): void => {
    setStep(index);
    window.scrollTo({ top: 0 });
  };
  return (
    <div className={styles.screen}>
      <header className={styles.top}>
        <Button variant="quiet" onClick={onBack}>
          ← К сессиям
        </Button>
        <ThemeSwitch />
      </header>
      <div>
        <h1 className={styles.title}>Лаборатория RAG</h1>
        <p className={styles.lead}>
          Как агент находит нужное в базе знаний и почему найденное не гарантирует верный ответ.
          Шесть шагов по порядку, в каждом — опыт на настоящих документах базы.
        </p>
      </div>
      <StepNav current={step} onStep={go} />
      <div className={styles.card}>
        {base.status === 'ready' ? (
          <CourseStep index={step} base={base.value} onStep={go} />
        ) : (
          <p className={base.status === 'error' ? styles.bad : styles.hint}>
            {base.status === 'loading' ? 'Загружаем базу знаний…' : base.message}
          </p>
        )}
      </div>
    </div>
  );
}

function StepNav({
  current,
  onStep,
}: {
  current: number;
  onStep: (index: number) => void;
}): ReactElement {
  return (
    <ol className={styles.steps} aria-label="Шаги маршрута">
      {COURSE_STEPS.map((step, index) => (
        <li key={step.id}>
          <button
            type="button"
            aria-current={index === current ? 'step' : undefined}
            onClick={() => {
              onStep(index);
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

interface CourseStepProps {
  index: number;
  base: LabBase;
  onStep: (index: number) => void;
}

function CourseStep({ index, base, onStep }: CourseStepProps): ReactElement {
  switch (COURSE_STEPS[index]?.id) {
    case 'chunks':
      return <StepChunks base={base} onStep={onStep} />;
    case 'vectors':
      return <StepVectors onStep={onStep} />;
    case 'methods':
      return <StepMethods base={base} onStep={onStep} />;
    case 'close':
      return <StepClose onStep={onStep} />;
    case 'check':
      return <StepCheck onStep={onStep} />;
    default:
      return <StepWhy base={base} onStep={onStep} />;
  }
}

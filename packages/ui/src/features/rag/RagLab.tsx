// Лаборатория RAG (этап 8b): учебный маршрут о том, как агент ищет в базе знаний.
// Шаги идут по порядку — от «зачем искать» к проверке ответа; каждый опирается на настоящие
// данные базы «Кедр Софт» с сервера (/api/rag).

import type { LabBase } from '@harness-visualization/mcp-server/lab';
import { useState, type ReactElement } from 'react';
import { ThemeToggle } from '../../components/ThemeToggle';
import { Button } from '../../components/Button';
import { Segmented } from '../../components/Segmented';
import { COURSE_STEPS } from './course/courseContent';
import { StepCheck } from './course/StepCheck';
import { CourseNav } from './course/StepShell';
import { StepChunks } from './course/StepChunks';
import { StepClose } from './course/StepClose';
import { StepMethods } from './course/StepMethods';
import { StepStorage } from './course/StepStorage';
import { StepVectors } from './course/StepVectors';
import { StepWhy } from './course/StepWhy';
import { DataTab } from './data/DataTab';
import styles from './RagLab.module.css';
import { useRagBase } from './useRagData';

const TABS = [
  { value: 'course', label: 'Маршрут' },
  { value: 'data', label: 'Данные' },
] as const;

export function RagLab({
  backLabel,
  onBack,
}: {
  backLabel: string;
  onBack: () => void;
}): ReactElement {
  const base = useRagBase();
  const [tab, setTab] = useState<'course' | 'data'>('course');
  const [step, setStep] = useState(0);
  const go = (index: number): void => {
    setStep(index);
    window.scrollTo({ top: 0 });
  };
  return (
    <div className={styles.screen}>
      <header className={styles.top}>
        <Button variant="quiet" onClick={onBack}>
          {backLabel}
        </Button>
        <ThemeToggle />
      </header>
      <div>
        <h1 className={styles.title}>Лаборатория RAG</h1>
        <p className={styles.lead} data-teaching>
          Как агент находит нужное в базе знаний и почему найденное не гарантирует верный ответ.
          «Маршрут» — семь шагов по порядку, в каждом опыт на настоящих документах базы. «Данные» —
          та же база без подсказок: свой запрос на карте и в трёх поисках.
        </p>
      </div>
      <div className={styles.tabs}>
        <Segmented label="Раздел" options={TABS} value={tab} onChange={setTab} />
      </div>
      {base.status !== 'ready' && (
        <p className={base.status === 'error' ? styles.bad : styles.hint}>
          {base.status === 'loading' ? 'Загружаем базу знаний…' : base.message}
        </p>
      )}
      {base.status === 'ready' && tab === 'course' && (
        <>
          <CourseNav steps={COURSE_STEPS} current={step} onStep={go} />
          <div className={styles.card}>
            <CourseStep index={step} base={base.value} onStep={go} />
          </div>
        </>
      )}
      {base.status === 'ready' && tab === 'data' && <DataTab base={base.value} />}
    </div>
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
    case 'storage':
      return <StepStorage base={base} onStep={onStep} />;
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

// Лаборатория RAG (этап 8b): учебный маршрут о том, как агент ищет в базе знаний.
// Шаги идут по порядку — от «зачем искать» к проверке ответа; каждый опирается на настоящие
// данные базы «Кедр Софт» с сервера (/api/rag).

import type { LabBase } from '@harness-visualization/mcp-server/lab';
import { useState, type ReactElement } from 'react';
import { useCourseStep } from '../useCourseStep';
import { ThemeToggle } from '../../components/ThemeToggle';
import { Button } from '../../components/Button';
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

type RagTab = 'course' | 'data';

// Вкладки с назначением — по фидбэку экспертов (29.10.2026): было неясно, зачем «Данные».
const TABS: readonly { value: RagTab; title: string; text: string }[] = [
  {
    value: 'course',
    title: `Урок · ${String(COURSE_STEPS.length)} шагов`,
    text: 'Как агент находит нужный документ — по порядку, с заданиями',
  },
  {
    value: 'data',
    title: 'Песочница',
    text: 'Свой запрос: карта смыслов, три вида поиска, сравнение двух фраз',
  },
];

export interface CourseLabProps {
  backLabel: string;
  onBack: () => void;
  // Шаг урока из адреса (?step=check); null — с начала.
  step: string | null;
  onStepChange: (id: string) => void;
}

export function RagLab({
  backLabel,
  onBack,
  step: initialStep,
  onStepChange,
}: CourseLabProps): ReactElement {
  const base = useRagBase();
  const [tab, setTab] = useState<RagTab>('course');
  const [step, go] = useCourseStep(COURSE_STEPS, initialStep, onStepChange);
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
          Начните с урока: семь шагов по порядку, в каждом опыт на настоящих документах базы.
          Песочница — та же база без заданий, чтобы проверить свои догадки.
        </p>
      </div>
      <RagTabs value={tab} onChange={setTab} />
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

function RagTabs(props: { value: RagTab; onChange: (tab: RagTab) => void }): ReactElement {
  return (
    <div className={styles.tabs} role="group" aria-label="Раздел">
      {TABS.map((tab) => (
        <button
          key={tab.value}
          type="button"
          className={styles.tab}
          aria-pressed={props.value === tab.value}
          onClick={() => {
            props.onChange(tab.value);
          }}
        >
          <b>{tab.title}</b>
          <span>{tab.text}</span>
        </button>
      ))}
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

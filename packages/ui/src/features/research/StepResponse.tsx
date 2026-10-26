// Вкладка «Ответ»: по умолчанию разобранный (рассуждение, текст, тулы, токены и цена),
// переключателем — сырое тело ответа, как оно пришло по сети.

import { useState, type ReactElement } from 'react';
import { Segmented } from '../../components/Segmented';
import type { ResearchStep } from '../../projections/projectResearch';
import { StepRaw } from './StepRaw';
import { StepReply } from './StepReply';
import styles from './Research.module.css';

const VIEWS = [
  { value: 'parsed', label: 'разобранный' },
  { value: 'raw', label: 'сырой' },
] as const;

export function StepResponse({ step }: { step: ResearchStep }): ReactElement {
  const [view, setView] = useState<'parsed' | 'raw'>('parsed');
  return (
    <>
      <div className={styles.subTabs}>
        <Segmented
          label="Вид ответа"
          size="small"
          options={VIEWS}
          value={view}
          onChange={setView}
        />
      </div>
      {view === 'parsed' ? <StepReply step={step} /> : <StepRaw step={step} side="response" />}
    </>
  );
}

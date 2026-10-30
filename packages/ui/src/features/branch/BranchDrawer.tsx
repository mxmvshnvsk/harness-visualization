// История до выбранного шага берётся из записи, продолжение запускается отдельной сессией.
import type { BranchStep } from '@harness-visualization/harness/branch';
import type { ReactElement } from 'react';
import { Button } from '../../components/Button';
import { Drawer } from '../../components/Drawer';
import { BranchEditFields } from './BranchEditFields';
import { BranchModelFields } from './BranchModelFields';
import { useBranchForm } from './branchFormState';
import styles from './Branch.module.css';

interface BranchDrawerProps {
  traceFile: string;
  step: BranchStep | null;
  onClose: () => void;
}

export function BranchDrawer({ traceFile, step, onClose }: BranchDrawerProps): ReactElement {
  return (
    <Drawer
      open={step !== null}
      label={step === null ? 'Ветка' : `Ветка от шага ${String(step.step)}`}
      onClose={onClose}
      side="right"
    >
      {step !== null && <BranchForm key={step.requestId} traceFile={traceFile} step={step} />}
    </Drawer>
  );
}

function BranchForm({ traceFile, step }: { traceFile: string; step: BranchStep }): ReactElement {
  const form = useBranchForm(traceFile, step);
  return (
    <div className={styles.form}>
      <ReplayNote step={step.step} />
      <BranchModelFields choice={form.model} />
      <p className={styles.muted}>
        Инструменты и настройки харнесса берутся из текущей конфигурации. Файлы — из состояния папки
        исходной сессии на момент запуска, а не снимка выбранного шага.
      </p>
      <BranchEditFields choice={form.edit} />
      {form.error !== null && <p className={styles.error}>{form.error}</p>}
      <Button variant="accent" onClick={() => void form.run()} disabled={!form.canRun}>
        {form.busy ? 'Запускаем…' : 'Запустить ветку'}
      </Button>
    </div>
  );
}

function ReplayNote({ step }: { step: number }): ReactElement {
  return (
    <p className={styles.note}>
      {step === 1 ? (
        <>
          <b>С шага 1 — новый прогон.</b> Из трейса берутся только system prompt и вопрос.
        </>
      ) : (
        <>
          <b>
            Шаги 1–{step - 1} — replay из трейса, с шага {step} — новый прогон.
          </b>{' '}
          Replay — без запросов к модели и без тулов: история берётся ровно такой, какой её видела
          модель. Новый прогон — запросы, тулы и политика по-настоящему, со своей ценой и своим
          трейсом.
        </>
      )}
    </p>
  );
}

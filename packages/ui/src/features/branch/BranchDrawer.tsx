// Панель ветки (этап 9) по мокапу, одобренному автором
// (https://claude.ai/artifact/LMVhes8JsdChMuzhzdGDVt): что поменять перед шагом и запуск.
// Шаги до выбранного — replay из трейса, с него — новый прогон: обычная живая сессия.

import type { BranchStep } from '@harness-visualization/harness/branch';
import { useContext, useState, type ReactElement } from 'react';
import { startBranch } from '../../api/serverApi';
import { markRouteStep } from '../../app/start/route';
import { Button } from '../../components/Button';
import { Drawer } from '../../components/Drawer';
import { Segmented } from '../../components/Segmented';
import { NavigationContext } from './BranchContext';
import styles from './Branch.module.css';

const CHANGES = [
  { value: 'replay', label: 'ничего — переиграть' },
  { value: 'toolResult', label: 'результат тула' },
] as const;

type Change = (typeof CHANGES)[number]['value'];

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
  const navigation = useContext(NavigationContext);
  const [change, setChange] = useState<Change>('replay');
  const results = step.toolResults;
  const [toolCallId, setToolCallId] = useState(results.at(-1)?.toolCallId ?? '');
  const original = results.find((result) => result.toolCallId === toolCallId)?.content ?? '';
  const [content, setContent] = useState<Record<string, string>>({});
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({
    busy: false,
    error: null,
  });
  const run = async (): Promise<void> => {
    setState({ busy: true, error: null });
    try {
      const edit =
        change === 'replay'
          ? ({ kind: 'replay' } as const)
          : ({ kind: 'toolResult', toolCallId, content: content[toolCallId] ?? original } as const);
      const { sessionId } = await startBranch({ traceFile, step: step.step, edit });
      markRouteStep('branch');
      navigation?.openSession(sessionId);
    } catch (error) {
      setState({ busy: false, error: error instanceof Error ? error.message : String(error) });
    }
  };
  return (
    <div className={styles.form}>
      <ReplayNote step={step.step} />
      <Segmented
        label="Что поменять"
        options={results.length === 0 ? CHANGES.slice(0, 1) : CHANGES}
        value={change}
        onChange={setChange}
        size="small"
      />
      {change === 'replay' ? (
        <p className={styles.muted}>
          Тот же prompt ещё раз. Ответ может отличаться — это недетерминизм модели, который evals
          меряют попытками.
        </p>
      ) : (
        <ToolResultEditor
          results={results}
          toolCallId={toolCallId}
          onChoose={setToolCallId}
          value={content[toolCallId] ?? original}
          onChange={(value) => {
            setContent((previous) => ({ ...previous, [toolCallId]: value }));
          }}
        />
      )}
      {state.error !== null && <p className={styles.error}>{state.error}</p>}
      <Button variant="accent" onClick={() => void run()} disabled={state.busy}>
        {state.busy ? 'Запускаем…' : 'Запустить ветку'}
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

function ToolResultEditor(props: {
  results: BranchStep['toolResults'];
  toolCallId: string;
  onChoose: (toolCallId: string) => void;
  value: string;
  onChange: (value: string) => void;
}): ReactElement {
  return (
    <div className={styles.form}>
      <label className={styles.field}>
        <span className={styles.muted}>Какой результат модель получит иначе:</span>
        <select
          className={styles.select}
          value={props.toolCallId}
          onChange={(event) => {
            props.onChoose(event.target.value);
          }}
        >
          {props.results.map((result) => (
            <option key={result.toolCallId} value={result.toolCallId}>
              {result.toolName}: {result.content.replaceAll('\n', ' ').slice(0, 60)}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.field}>
        <span className={styles.muted}>Результат, который увидит модель:</span>
        <textarea
          className={styles.textarea}
          value={props.value}
          onChange={(event) => {
            props.onChange(event.target.value);
          }}
        />
      </label>
    </div>
  );
}

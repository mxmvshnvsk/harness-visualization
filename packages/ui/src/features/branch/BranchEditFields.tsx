import type { BranchStep } from '@harness-visualization/harness/branch';
import type { ReactElement } from 'react';
import { Segmented } from '../../components/Segmented';
import type { BranchEditChoice } from './branchFormState';
import styles from './Branch.module.css';

const CHANGES = [
  { value: 'replay', label: 'ничего — переиграть' },
  { value: 'toolResult', label: 'результат тула' },
] as const;

export function BranchEditFields({ choice }: { choice: BranchEditChoice }): ReactElement {
  return (
    <>
      <Segmented
        label="Что поменять"
        options={choice.results.length === 0 ? CHANGES.slice(0, 1) : CHANGES}
        value={choice.kind}
        onChange={choice.setKind}
        size="small"
      />
      {choice.kind === 'replay' ? (
        <p className={styles.muted}>
          Продолжение с выбранного шага. Ответ может отличаться — это недетерминизм модели, который
          evals меряют попытками.
        </p>
      ) : (
        <ToolResultEditor
          results={choice.results}
          toolCallId={choice.toolCallId}
          onChoose={choice.setToolCallId}
          value={choice.content}
          onChange={choice.setContent}
        />
      )}
    </>
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

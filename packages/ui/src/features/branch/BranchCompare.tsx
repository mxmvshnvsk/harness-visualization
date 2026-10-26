// Сравнение двух веток одной семьи: «было» и «стало» — ответы рядом, абзацы, которых нет
// в другом ответе, подсвечены; шаги, тулы и цена. По умолчанию — открытая ветка против родителя.

import type { HarnessEvent } from '@harness-visualization/harness';
import { readTrialFacts } from '@harness-visualization/harness/evals';
import type { TraceOutcome } from '@harness-visualization/server';
import { useState, type ReactElement } from 'react';
import { getTraceOutcome } from '../../api/serverApi';
import { MarkdownView } from '../../help/MarkdownView';
import { paragraphsOf, uniqueParagraphs, type BranchNode } from '../../projections/branchTree';
import { useLoaded } from '../rag/useRagData';
import { CURRENT, describeNode } from './branchLabels';
import styles from './Branch.module.css';

export function BranchCompare(props: {
  family: BranchNode[];
  current: string;
  events: readonly HarnessEvent[];
}): ReactElement {
  const { family, current } = props;
  const parent = family.find((node) => node.trace.file === current)?.parentFile;
  const [left, setLeft] = useState(parent ?? family[0]?.trace.file ?? current);
  const [right, setRight] = useState(current);
  return (
    <section className={styles.card}>
      <h2 className={styles.title}>Сравнение</h2>
      <div className={styles.pickers}>
        <Picker label="было" family={family} value={left} onChange={setLeft} />
        <Picker label="стало" family={family} value={right} onChange={setRight} />
      </div>
      <div className={styles.pair}>
        <OutcomeColumn file={left} other={right} events={props.events} />
        <OutcomeColumn file={right} other={left} events={props.events} />
      </div>
    </section>
  );
}

function Picker(props: {
  label: string;
  family: BranchNode[];
  value: string;
  onChange: (file: string) => void;
}): ReactElement {
  return (
    <label className={styles.field}>
      <span className={styles.muted}>{props.label}</span>
      <select
        className={styles.select}
        value={props.value}
        onChange={(event) => {
          props.onChange(event.target.value);
        }}
      >
        {props.family.map((node) => (
          <option key={node.trace.file} value={node.trace.file}>
            {'  '.repeat(node.depth)}
            {describeNode(node)} · {node.trace.sessionId ?? node.trace.file}
          </option>
        ))}
      </select>
    </label>
  );
}

// Открытая живая сессия — ещё не трейс: её итог считается по событиям на экране.
type Outcome = Omit<TraceOutcome, 'file'>;

function useOutcome(file: string, events: readonly HarnessEvent[]) {
  return useLoaded<Outcome>(
    () => (file === CURRENT ? Promise.resolve(readTrialFacts([...events])) : getTraceOutcome(file)),
    [file, file === CURRENT ? events.length : 0],
  );
}

function OutcomeColumn(props: {
  file: string;
  other: string;
  events: readonly HarnessEvent[];
}): ReactElement {
  const mine = useOutcome(props.file, props.events);
  const other = useOutcome(props.other, props.events);
  if (mine.status !== 'ready') {
    return (
      <p className={styles.muted}>{mine.status === 'loading' ? 'Загружаем…' : mine.message}</p>
    );
  }
  const { answer } = mine.value;
  const otherAnswer = other.status === 'ready' ? (other.value.answer ?? '') : '';
  const unique = answer === null ? new Set<string>() : uniqueParagraphs(answer, otherAnswer);
  const cost = mine.value.costUsd === null ? '?' : mine.value.costUsd.toFixed(6);
  return (
    <div className={styles.column}>
      <span className={styles.numbers}>
        {mine.value.modelRequests} запр. · {mine.value.toolCalls.length} тулов · {cost} USD ·{' '}
        {(mine.value.workMs / 1000).toFixed(1)} с работы
      </span>
      <div className={styles.answer}>
        {answer === null ? (
          <span className={styles.muted}>Ответа ещё нет.</span>
        ) : (
          paragraphsOf(answer).map((paragraph, index) => (
            <div
              key={index}
              data-unique={unique.has(paragraph) || undefined}
              className={styles.paragraph}
            >
              <MarkdownView text={paragraph} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

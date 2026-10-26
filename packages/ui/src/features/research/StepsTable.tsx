// Таблица запросов к модели: input, доля кэша, output, время; между запросами — события
// харнесса мелким шрифтом (клик — перемотка плеера к событию). Сверху — input по запросам.

import { Fragment, type ReactElement } from 'react';
import type { ResearchNote, ResearchStep, ResearchView } from '../../projections/projectResearch';
import { formatNumber, percent } from './StepsView';
import styles from './Research.module.css';

interface StepsTableProps {
  view: ResearchView;
  selected: number;
  onSelect: (index: number) => void;
  onSeek: (eventIndex: number) => void;
}

export function StepsTable({ view, selected, onSelect, onSeek }: StepsTableProps): ReactElement {
  return (
    <section className={styles.panel}>
      <InputBars steps={view.steps} selected={selected} onSelect={onSelect} />
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>#</th>
              <th>запрос · тулы</th>
              <th>input</th>
              <th>кэш</th>
              <th>out</th>
              <th>с</th>
            </tr>
          </thead>
          <tbody>
            <Notes notes={view.before} onSeek={onSeek} />
            {view.steps.map((step, index) => (
              <Fragment key={step.request.requestId}>
                <StepRow
                  step={step}
                  selected={index === selected}
                  onSelect={() => onSelect(index)}
                />
                <Notes notes={step.notes} onSeek={onSeek} />
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.keys}>
        <kbd>j</kbd> <kbd>k</kbd> — запрос вперёд и назад · <kbd>1</kbd>–<kbd>3</kbd> — вкладки ·
        клик по событию — перемотка
      </p>
    </section>
  );
}

function StepRow(props: {
  step: ResearchStep;
  selected: boolean;
  onSelect: () => void;
}): ReactElement {
  const { step } = props;
  const tools = step.response?.reply.toolCalls.map((call) => call.name) ?? [];
  return (
    <tr className={styles.stepRow} aria-selected={props.selected}>
      <td>{step.number}</td>
      <td>
        <button type="button" className={styles.stepButton} onClick={props.onSelect}>
          {step.agentId === null ? '' : `[${step.agentId}] `}
          {step.label}
          {tools.length > 0 && <span className={styles.toolTag}>{summarizeTools(tools)}</span>}
          {step.error !== null && <span className={styles.errorTag}>ошибка</span>}
        </button>
      </td>
      {usageCells(step).map((cell, index) => (
        <td key={index}>{cell}</td>
      ))}
    </tr>
  );
}

// input, кэш, out, секунды; ответа ещё нет — прочерки.
function usageCells(step: ResearchStep): string[] {
  if (step.response === null) {
    return ['—', '—', '—', '—'];
  }
  const { usage } = step.response.reply;
  return [
    formatNumber(usage.inputTokens),
    percent(usage.inputCacheHitTokens, usage.inputTokens),
    formatNumber(usage.outputTokens),
    (step.response.durationMs / 1000).toFixed(1),
  ];
}

// «read_document ×2, search» — повторы схлопнуты.
function summarizeTools(names: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const name of names) {
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts]
    .map(([name, count]) => (count > 1 ? `${name} ×${String(count)}` : name))
    .join(', ');
}

function Notes(props: {
  notes: readonly ResearchNote[];
  onSeek: (index: number) => void;
}): ReactElement {
  return (
    <>
      {props.notes.map((note) => (
        <tr key={note.index} className={styles.noteRow} data-type={note.type}>
          <td />
          <td colSpan={5}>
            <button
              type="button"
              className={styles.noteButton}
              onClick={() => props.onSeek(note.index)}
            >
              {note.text}
            </button>
          </td>
        </tr>
      ))}
    </>
  );
}

function InputBars(props: {
  steps: readonly ResearchStep[];
  selected: number;
  onSelect: (index: number) => void;
}): ReactElement {
  const inputs = props.steps.map((step) => step.response?.reply.usage.inputTokens ?? 0);
  const max = Math.max(1, ...inputs);
  return (
    <div className={styles.bars} role="group" aria-label="input по запросам">
      {inputs.map((input, index) => (
        <button
          key={index}
          type="button"
          className={styles.barItem}
          aria-pressed={index === props.selected}
          title={`запрос ${String(index + 1)}: ${formatNumber(input)} input`}
          style={{ height: `${String(Math.max(4, Math.round((100 * input) / max)))}%` }}
          onClick={() => props.onSelect(index)}
        />
      ))}
    </div>
  );
}

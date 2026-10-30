import { ModelActor } from '../models/ModelActor';
// Таблица запросов к модели: input, доля кэша, output, время; между запросами — события
// харнесса мелким шрифтом (клик — перемотка плеера к событию). Сверху — input по запросам.
// Таблица — по всей записи (мокап, одобренный 29.10.2026): перемотка не прячет шаги, а ставит
// отметку «плеер здесь»; то, что после неё, — бледнее, но открывается.

import { Fragment, type ReactElement } from 'react';
import type { ResearchNote, ResearchStep, ResearchView } from '../../projections/projectResearch';
import { formatNumber, percent } from './StepsView';
import styles from './Research.module.css';
import { formatFixed } from '../../text/formatNumber';

interface StepsTableProps {
  view: ResearchView;
  // Сколько событий показал плеер: всё с номером не меньше — «впереди».
  cursor: number;
  selected: number;
  onSelect: (index: number) => void;
  onSeek: (eventIndex: number) => void;
}

export function StepsTable(props: StepsTableProps): ReactElement {
  const { view, selected, onSelect, onSeek, cursor } = props;
  const place = { cursor, marker: firstAhead(view, cursor) };
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
            <Notes notes={view.before} place={place} onSeek={onSeek} />
            {view.steps.map((step, index) => (
              <Fragment key={step.request.requestId}>
                {step.index === place.marker && <CursorRow />}
                <StepRow
                  step={step}
                  ahead={step.index >= cursor}
                  selected={index === selected}
                  onSelect={() => onSelect(index)}
                />
                <Notes notes={step.notes} place={place} onSeek={onSeek} />
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

// Первое событие впереди плеера — перед ним отметка; undefined — плеер в конце записи.
function firstAhead(view: ResearchView, cursor: number): number | undefined {
  const indexes = [
    ...view.before.map((note) => note.index),
    ...view.steps.flatMap((step) => [step.index, ...step.notes.map((note) => note.index)]),
  ];
  const ahead = indexes.filter((index) => index >= cursor);
  return ahead.length === 0 ? undefined : Math.min(...ahead);
}

function CursorRow(): ReactElement {
  return (
    <tr className={styles.cursorRow}>
      <td colSpan={6}>
        <span>плеер здесь</span>
      </td>
    </tr>
  );
}

interface Place {
  cursor: number;
  marker: number | undefined;
}

function StepRow(props: {
  step: ResearchStep;
  ahead: boolean;
  selected: boolean;
  onSelect: () => void;
}): ReactElement {
  const { step } = props;
  const tools = step.response?.reply.toolCalls.map((call) => call.name) ?? [];
  return (
    <tr className={styles.stepRow} aria-selected={props.selected} data-ahead={props.ahead}>
      <td>{step.number}</td>
      <td>
        <button type="button" className={styles.stepButton} onClick={props.onSelect}>
          {step.agentId === null ? '' : `[${step.agentId}] `}
          {step.label} <ModelActor requestId={step.request.requestId} />
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
    formatFixed(step.response.durationMs / 1000, 1),
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
  place: Place;
  onSeek: (index: number) => void;
}): ReactElement {
  const { place } = props;
  return (
    <>
      {props.notes.map((note) => (
        <Fragment key={note.index}>
          {note.index === place.marker && <CursorRow />}
          <tr
            className={styles.noteRow}
            data-type={note.type}
            data-ahead={note.index >= place.cursor}
          >
            <td />
            <td colSpan={5}>
              <button
                type="button"
                className={styles.noteButton}
                onClick={() => props.onSeek(note.index)}
              >
                {note.text} <ModelActor eventIndex={note.index} />
              </button>
            </td>
          </tr>
        </Fragment>
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

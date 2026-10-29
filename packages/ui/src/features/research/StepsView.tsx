// Режим «Исследование»: экран шагов вместо инспектора (по мокапу, одобренному автором
// 26.10.2026). Слева — все запросы к модели таблицей, между ними — что сделал харнесс; справа —
// выбранный запрос: снимок контекста с разницей, сырые запрос и ответ, разобранный ответ.
// Идёт за курсором повтора; j / k — шаг вперёд и назад, 1–3 — вкладки.

import type { HarnessEvent } from '@harness-visualization/harness';
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { Segmented } from '../../components/Segmented';
import type { SearchLink } from '../../app/viewLinks';
import { projectResearch, type ResearchStep } from '../../projections/projectResearch';
import { timeAt, type Schedule } from '../../timeline/schedule';
import type { TimelineClock } from '../../timeline/TimelineClock';
import { StepContext } from './StepContext';
import { StepExplain } from './StepExplain';
import { StepRaw } from './StepRaw';
import { StepResponse } from './StepResponse';
import { StepsTable } from './StepsTable';
import styles from './Research.module.css';
import { formatFixed, formatRu } from '../../text/formatNumber';

const TABS = [
  { value: 'context', label: 'Контекст' },
  { value: 'request', label: 'Запрос' },
  { value: 'response', label: 'Ответ' },
] as const;

type Tab = (typeof TABS)[number]['value'];

interface StepsViewProps {
  // Пришли по ссылке «в инспекторе →»: открыть шаг с этим запросом или вызовом тула.
  focus?: SearchLink | null;
  events: readonly HarnessEvent[];
  shown: number;
  clock: TimelineClock;
  schedule: Schedule;
}

export function StepsView(props: StepsViewProps): ReactElement {
  const { events, shown, clock, schedule } = props;
  const focus = props.focus ?? null;
  const highlight = focus?.toolCallId ?? null;
  // Вся запись, а не до плеера: перемотка не прячет шаги (мокап 29.10.2026).
  const view = useMemo(() => projectResearch(events, events.length), [events]);
  // null — следовать за повтором: открыт последний запрос, до которого дошёл плеер.
  const [picked, setPicked] = useState<number | null>(() => stepOfFocus(view.steps, focus));
  const [tab, setTab] = useState<Tab>(highlight === null ? 'context' : 'response');
  const selected = Math.min(picked ?? reachedStep(view.steps, shown), view.steps.length - 1);
  useStepKeys(view.steps.length, selected, setPicked, setTab);
  const step = view.steps[selected];
  if (step === undefined) {
    return <p className={styles.muted}>Запросов к модели пока нет.</p>;
  }
  return (
    <div className={styles.layout}>
      <StepsTable
        view={view}
        cursor={shown}
        selected={selected}
        onSelect={setPicked}
        onSeek={(index) => {
          // Перемотка к событию не меняет открытый шаг — он остаётся, каким был.
          setPicked(selected);
          clock.seek(timeAt(schedule, offsetOf(events, index)));
        }}
      />
      <section className={styles.panel}>
        <StepHead step={step} total={view.steps.length} />
        <div className={styles.tabs}>
          <Segmented
            label="Что показать"
            size="small"
            options={TABS}
            value={tab}
            onChange={setTab}
          />
        </div>
        <StepTab
          tab={tab}
          step={step}
          steps={view.steps}
          startedAt={startOf(events)}
          highlight={highlight}
        />
      </section>
    </div>
  );
}

interface StepTabProps {
  tab: Tab;
  step: ResearchStep;
  steps: readonly ResearchStep[];
  startedAt: number;
  highlight: string | null;
}

// Содержимое вкладки; над сырым запросом и ответом — плашка «что это».
function StepTab({ tab, step, steps, startedAt, highlight }: StepTabProps): ReactElement {
  if (tab === 'context') {
    return <StepContext step={step} steps={steps} />;
  }
  return (
    <>
      <StepExplain step={step} side={tab} startedAt={startedAt} />
      {tab === 'request' ? (
        <StepRaw step={step} side="request" />
      ) : (
        <StepResponse step={step} highlight={highlight} />
      )}
    </>
  );
}

// Последний запрос, до которого дошёл плеер; плеер ещё до первого — первый.
function reachedStep(steps: readonly ResearchStep[], shown: number): number {
  return Math.max(
    0,
    steps.findLastIndex((step) => step.index < shown),
  );
}

function startOf(events: readonly HarnessEvent[]): number {
  const first = events[0];
  return first === undefined ? 0 : Date.parse(first.timestamp);
}

// timeAt ждёт мс от начала сессии, а таблица отдаёт номер события — переводим по его времени.
function offsetOf(events: readonly HarnessEvent[], index: number): number {
  const first = events[0];
  const event = events[index];
  return first === undefined || event === undefined
    ? 0
    : Date.parse(event.timestamp) - Date.parse(first.timestamp);
}

// Номер шага, к которому ведёт ссылка; null — ссылки нет или шаг ещё не показан.
function stepOfFocus(steps: readonly ResearchStep[], focus: SearchLink | null): number | null {
  if (focus === null) {
    return null;
  }
  const index = steps.findIndex((step) =>
    focus.toolCallId === null
      ? step.request.requestId === focus.requestId
      : step.response?.reply.toolCalls.some((call) => call.id === focus.toolCallId) === true,
  );
  return index < 0 ? null : index;
}

function StepHead({ step, total }: { step: ResearchStep; total: number }): ReactElement {
  return (
    <div className={styles.stepHead}>
      <h2 className={styles.stepTitle}>
        {step.agentId === null ? '' : `[${step.agentId}] `}
        {step.label} · запрос {step.number} из {total}
      </h2>
      <span className={styles.mono}>{describeOutcome(step)}</span>
    </div>
  );
}

function describeOutcome(step: ResearchStep): string {
  if (step.error !== null) {
    return `ошибка: ${step.error.message}`;
  }
  if (step.response === null) {
    return 'ждём ответ';
  }
  const { usage } = step.response.reply;
  const cost = step.response.cost?.total;
  return [
    `${formatNumber(usage.inputTokens)} input`,
    `кэш ${percent(usage.inputCacheHitTokens, usage.inputTokens)}`,
    `${formatNumber(usage.outputTokens)} out`,
    formatSeconds(step.response.durationMs),
    ...(cost === undefined ? [] : [`$${formatFixed(cost, 4)}`]),
  ].join(' · ');
}

// j / k — шаг, 1–3 — вкладка; не мешаем полям ввода.
function useStepKeys(
  count: number,
  selected: number,
  setPicked: (index: number) => void,
  setTab: (tab: Tab) => void,
): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (
        target?.closest('input, textarea, select, [contenteditable]') ||
        event.metaKey ||
        event.ctrlKey
      ) {
        return;
      }
      if (event.key === 'j') {
        setPicked(Math.min(count - 1, selected + 1));
      } else if (event.key === 'k') {
        setPicked(Math.max(0, selected - 1));
      } else if (['1', '2', '3'].includes(event.key)) {
        setTab(TABS[Number(event.key) - 1]?.value ?? 'context');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [count, selected, setPicked, setTab]);
}

export function formatNumber(value: number): string {
  return formatRu(value);
}

export function percent(part: number, whole: number): string {
  return whole === 0 ? '—' : `${String(Math.round((100 * part) / whole))} %`;
}

export function formatSeconds(ms: number): string {
  return `${formatFixed(ms / 1000, 1)} с`;
}

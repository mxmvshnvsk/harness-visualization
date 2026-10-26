// Режим «Исследование»: экран шагов вместо инспектора (по мокапу, одобренному автором
// 26.10.2026). Слева — все запросы к модели таблицей, между ними — что сделал харнесс; справа —
// выбранный запрос: снимок контекста с разницей, сырые запрос и ответ, разобранный ответ.
// Идёт за курсором повтора; j / k — шаг вперёд и назад, 1–3 — вкладки.

import type { HarnessEvent } from '@harness-visualization/harness';
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { Segmented } from '../../components/Segmented';
import { projectResearch, type ResearchStep } from '../../projections/projectResearch';
import { timeAt, type Schedule } from '../../timeline/schedule';
import type { TimelineClock } from '../../timeline/TimelineClock';
import { StepContext } from './StepContext';
import { StepRaw } from './StepRaw';
import { StepReply } from './StepReply';
import { StepsTable } from './StepsTable';
import styles from './Research.module.css';

const TABS = [
  { value: 'context', label: 'Контекст' },
  { value: 'raw', label: 'Сырое' },
  { value: 'reply', label: 'Ответ модели' },
] as const;

type Tab = (typeof TABS)[number]['value'];

interface StepsViewProps {
  events: readonly HarnessEvent[];
  shown: number;
  clock: TimelineClock;
  schedule: Schedule;
}

export function StepsView({ events, shown, clock, schedule }: StepsViewProps): ReactElement {
  const view = useMemo(() => projectResearch(events, shown), [events, shown]);
  // null — следовать за повтором: открыт последний показанный запрос.
  const [picked, setPicked] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>('context');
  const selected = Math.min(picked ?? view.steps.length - 1, view.steps.length - 1);
  useStepKeys(view.steps.length, selected, setPicked, setTab);
  const step = view.steps[selected];
  if (step === undefined) {
    return <p className={styles.muted}>Запросов к модели пока нет.</p>;
  }
  return (
    <div className={styles.layout}>
      <StepsTable
        view={view}
        selected={selected}
        onSelect={setPicked}
        onSeek={(index) => {
          clock.seek(timeAt(schedule, index));
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
        {tab === 'context' && <StepContext step={step} steps={view.steps} />}
        {tab === 'raw' && <StepRaw step={step} />}
        {tab === 'reply' && <StepReply step={step} />}
      </section>
    </div>
  );
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
    ...(cost === undefined ? [] : [`$${cost.toFixed(4)}`]),
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
  return value.toLocaleString('ru-RU');
}

export function percent(part: number, whole: number): string {
  return whole === 0 ? '—' : `${String(Math.round((100 * part) / whole))} %`;
}

export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} с`;
}

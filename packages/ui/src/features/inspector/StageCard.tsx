// Карточка этапа: пиктограмма типа, заголовок, пометка, состояние и строки событий.
// Будущее приглушено, текущий этап выделен цветом акцента (в тёмной теме) или группы (в светлой).

import { useEffect, useRef, useState, type ReactElement } from 'react';
import type { Stage, StageKind, StageRow } from '../../projections/projectStages';
import type { SessionView } from '../../projections/sessionView';
import { hasRetrieval, type Focus } from './focus';
import { FocusedPanel } from './FocusedPanel';
import { SubagentBlock } from './SubagentBlock';
import { PhaseLine } from './PhaseBar';
import { inferenceTiming } from '../../projections/inferenceTiming';
import { AgentChip } from '../agents/AgentChip';
import { useSubagentSteps } from './subagentSteps';
import styles from './Stages.module.css';

interface StageCardProps {
  stage: Stage;
  view: SessionView;
  shown: number;
  active: boolean;
  // Пришли по ссылке из другого вида: раскрыть «Подробнее» на этом вызове.
  focus?: Focus | null;
  // Этап субагента внутри карточки главного агента (этап 6c): id субагента — метка в заголовке.
  nested?: boolean;
  agentId?: string;
  cardRef: (element: HTMLElement | null) => void;
  onSeek: (at: number) => void;
}

export function StageCard({
  stage,
  view,
  shown,
  active,
  focus,
  nested = false,
  agentId,
  cardRef,
  onSeek,
}: StageCardProps): ReactElement {
  const started = shown > stage.firstIndex;
  const reached = stage.rows.filter((row) => row.index < shown);
  const current = active ? reached.at(-1) : undefined;
  return (
    <article
      ref={cardRef}
      className={styles.card}
      data-kind={stage.kind}
      data-state={stateOf(started, active)}
      data-nested={nested}
    >
      <header className={styles.head}>
        <span className={styles.icon} aria-hidden="true">
          <StageIcon kind={stage.kind} />
        </span>
        {nested && <AgentChip agentId={agentId} />}
        <h2 className={styles.title}>{stage.title}</h2>
        {showBadge(stage, started, reached) && <span className={styles.badge}>{stage.badge}</span>}
        <span className={styles.when}>{statusOf(stage, started, active, reached)}</span>
      </header>
      {showBadge(stage, started, reached) && <StagePhases stage={stage} view={view} />}
      <ul className={styles.rows}>
        {stage.rows.map((row) => (
          <Row
            key={row.index}
            row={row}
            view={view}
            shown={shown}
            nested={nested}
            now={row === current}
            onSeek={onSeek}
          />
        ))}
      </ul>
      {started && <Details stage={stage} view={view} target={focus ?? null} />}
    </article>
  );
}

// Фазы запроса шага (этап 8d.3) — одной строкой, когда ответ уже пришёл.
function StagePhases({ stage, view }: { stage: Stage; view: SessionView }): ReactElement | null {
  if (stage.kind !== 'agent' || stage.requestId === null) {
    return null;
  }
  const call = view.modelCalls.find((item) => item.requestId === stage.requestId);
  const timing = inferenceTiming(call?.response ?? null);
  return timing === null ? null : (
    <div className={styles.phases}>
      <PhaseLine timing={timing} />
    </div>
  );
}

function Row({
  row,
  view,
  shown,
  nested,
  now,
  onSeek,
}: {
  row: StageRow;
  view: SessionView;
  shown: number;
  // В этапах самого субагента строка поручения есть, но шаги там уже раскрыты.
  nested: boolean;
  now: boolean;
  onSeek: (at: number) => void;
}): ReactElement {
  const opensSubagent = row.subagent?.edge === 'start' && !nested;
  return (
    <li className={styles.row} data-pending={row.index >= shown} data-now={now}>
      <button
        type="button"
        className={styles.rowButton}
        title="Перемотать сюда"
        onClick={() => {
          onSeek(row.at);
        }}
      >
        <span className={styles.time}>+{formatSeconds(row.at)}</span>
        <span>
          {row.subagent !== undefined && <AgentSwatch subagentId={row.subagent.id} />}
          {row.code !== null && <code className={styles.code}>{row.code}</code>} {row.text}
        </span>
      </button>
      {opensSubagent && row.subagent !== undefined && (
        <SubagentBlock subagentId={row.subagent.id} view={view} shown={shown} onSeek={onSeek} />
      )}
    </li>
  );
}

function AgentSwatch({ subagentId }: { subagentId: string }): ReactElement | null {
  const steps = useSubagentSteps(subagentId);
  return steps === null ? null : (
    <span className={styles.swatch} data-color={steps.run.color} aria-hidden="true" />
  );
}

// «Подробнее»: запрос к модели этапа, его тулы или retrieval — те же панели, что были в инспекторе.
function Details(props: {
  stage: Stage;
  view: SessionView;
  target: Focus | null;
}): ReactElement | null {
  const { stage, view, target } = props;
  const initial = initialFocus(stage, view);
  const [open, setOpen] = useState(target !== null);
  const [focus, setFocus] = useState<Focus | null>(target ?? initial);
  const ref = useRef<HTMLDivElement>(null);
  // Новый объект цели на каждом кадре повтора — прокручиваем по смыслу цели, а не по ссылке.
  const targetKey = target === null ? null : JSON.stringify(target);
  useEffect(() => {
    if (targetKey !== null) {
      ref.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }, [targetKey]);
  if (initial === null) {
    return null;
  }
  return (
    <div ref={ref} className={styles.details}>
      <button
        type="button"
        className={styles.more}
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
        }}
      >
        {open ? 'Свернуть' : 'Подробнее'}
      </button>
      {open && <FocusedPanel view={view} focus={focus ?? initial} onFocus={setFocus} />}
    </div>
  );
}

function initialFocus(stage: Stage, view: SessionView): Focus | null {
  if (
    stage.requestId !== null &&
    view.modelCalls.some((call) => call.requestId === stage.requestId)
  ) {
    return { kind: 'model', requestId: stage.requestId };
  }
  if (stage.kind === 'prep' && hasRetrieval(view)) {
    return { kind: 'retrieval' };
  }
  const service = view.modelCalls.find((call) => call.purpose !== 'agentStep');
  return stage.kind === 'prep' && service !== undefined
    ? { kind: 'model', requestId: service.requestId }
    : null;
}

// Пометка шага — что ответила модель; пока ответа нет, её не показываем, чтобы не забегать вперёд.
function showBadge(stage: Stage, started: boolean, reached: StageRow[]): boolean {
  if (stage.kind !== 'agent') {
    return true;
  }
  return started && reached.some((row) => row.text.startsWith('ответ'));
}

function stateOf(started: boolean, active: boolean): 'future' | 'active' | 'done' {
  if (!started) {
    return 'future';
  }
  return active ? 'active' : 'done';
}

function statusOf(stage: Stage, started: boolean, active: boolean, reached: StageRow[]): string {
  if (!started) {
    return 'впереди';
  }
  if (!active) {
    return 'готово';
  }
  if (stage.kind !== 'agent') {
    return stage.kind === 'answer' ? 'готово' : 'идёт';
  }
  // Есть строка ответа модели — дальше работают тулы.
  return reached.some((row) => row.text.startsWith('ответ'))
    ? 'выполняются тулы'
    : 'модель думает…';
}

// Подготовка — штекер (подключение MCP, сборка prompt), следующий вопрос — облачко с вопросом,
// шаг агента — искра модели, ответ — сообщение.
const ICONS: Record<StageKind, string> = {
  prep: 'M9 3v5M15 3v5M7 8h10v3a5 5 0 0 1-10 0V8ZM12 16v5',
  question:
    'M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1ZM10 9a2 2 0 1 1 2.8 1.8c-.5.3-.8.7-.8 1.2M12 13.5v.1',
  agent:
    'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3ZM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z',
  answer:
    'M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1ZM8 9.5h8M8 12.5h5',
};

function StageIcon({ kind }: { kind: StageKind }): ReactElement {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={ICONS[kind]} />
    </svg>
  );
}

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} с`;
}

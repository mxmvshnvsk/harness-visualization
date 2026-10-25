// Карточка этапа: пиктограмма типа, заголовок, пометка, состояние и строки событий.
// Будущее приглушено, текущий этап выделен цветом акцента (в тёмной теме) или группы (в светлой).

import { useState, type ReactElement } from 'react';
import type { Stage, StageKind, StageRow } from '../../projections/projectStages';
import type { SessionView } from '../../projections/sessionView';
import { hasRetrieval, type Focus } from './focus';
import { FocusedPanel } from './FocusedPanel';
import styles from './Stages.module.css';

interface StageCardProps {
  stage: Stage;
  view: SessionView;
  shown: number;
  active: boolean;
  cardRef: (element: HTMLElement | null) => void;
  onSeek: (at: number) => void;
}

export function StageCard({
  stage,
  view,
  shown,
  active,
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
    >
      <header className={styles.head}>
        <span className={styles.icon} aria-hidden="true">
          <StageIcon kind={stage.kind} />
        </span>
        <h2 className={styles.title}>{stage.title}</h2>
        {showBadge(stage, started, reached) && <span className={styles.badge}>{stage.badge}</span>}
        <span className={styles.when}>{statusOf(stage, started, active, reached)}</span>
      </header>
      <ul className={styles.rows}>
        {stage.rows.map((row) => (
          <Row
            key={row.index}
            row={row}
            pending={row.index >= shown}
            now={row === current}
            onSeek={onSeek}
          />
        ))}
      </ul>
      {started && <Details stage={stage} view={view} />}
    </article>
  );
}

function Row({
  row,
  pending,
  now,
  onSeek,
}: {
  row: StageRow;
  pending: boolean;
  now: boolean;
  onSeek: (at: number) => void;
}): ReactElement {
  return (
    <li className={styles.row} data-pending={pending} data-now={now}>
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
          {row.code !== null && <code className={styles.code}>{row.code}</code>} {row.text}
        </span>
      </button>
    </li>
  );
}

// «Подробнее»: запрос к модели этапа, его тулы или retrieval — те же панели, что были в инспекторе.
function Details({ stage, view }: { stage: Stage; view: SessionView }): ReactElement | null {
  const initial = initialFocus(stage, view);
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState<Focus | null>(initial);
  if (initial === null) {
    return null;
  }
  return (
    <div className={styles.details}>
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
    return stage.kind === 'prep' ? 'идёт' : 'готово';
  }
  // Есть строка ответа модели — дальше работают тулы.
  return reached.some((row) => row.text.startsWith('ответ'))
    ? 'выполняются тулы'
    : 'модель думает…';
}

// Подготовка — штекер (подключение MCP, сборка prompt), шаг агента — искра модели, ответ — сообщение.
const ICONS: Record<StageKind, string> = {
  prep: 'M9 3v5M15 3v5M7 8h10v3a5 5 0 0 1-10 0V8ZM12 16v5',
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

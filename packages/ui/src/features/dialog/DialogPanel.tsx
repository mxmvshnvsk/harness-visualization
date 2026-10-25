// Колонка «Диалог» (этап 6.1): ходы диалога сверху вниз — вопрос, что харнесс делает сейчас,
// ответ и итог хода — и поле ввода внизу, которое никуда не пропадает. В повторе записи
// колонка только для чтения: реплики появляются по ходу плеера.

import type { HarnessEvent } from '@harness-visualization/harness';
import { useEffect, useMemo, useRef, type ReactElement, type ReactNode } from 'react';
import { projectDialog } from '../../projections/projectDialog';
import { timeAt, type Schedule } from '../../timeline/schedule';
import type { TimelineClock } from '../../timeline/TimelineClock';
import { Composer } from './Composer';
import styles from './Dialog.module.css';
import { modeOf, STATE_LABELS } from './dialogMode';
import { TurnView } from './TurnView';

interface DialogPanelProps {
  events: readonly HarnessEvent[];
  // Сколько событий показано повтором.
  shown: number;
  // Сессия сервера — у неё можно спросить ещё; null — трейс.
  sessionId: string | null;
  live: boolean;
  clock: TimelineClock;
  schedule: Schedule;
  // Чего агент ждёт от человека прямо сейчас — вопрос о разрешении; под текущим ходом.
  request: ReactNode;
  onCollapse: () => void;
}

export function DialogPanel(props: DialogPanelProps): ReactElement {
  const { events, shown, sessionId, live, clock, schedule, request, onCollapse } = props;
  const turns = useMemo(() => projectDialog(events), [events]);
  const visible = turns.filter((turn) => turn.askedIndex < shown);
  const mode = modeOf(sessionId, live, events);
  const bodyRef = useAutoScroll(
    visible.length +
      visible.filter((turn) => isAnswered(turn, shown)).length +
      (request === null ? 0 : 1),
  );
  return (
    <aside className={styles.panel} aria-label="Диалог">
      <div className={styles.head}>
        <h2 className={styles.title}>Диалог</h2>
        <span className={styles.state}>{STATE_LABELS[mode]}</span>
        <button
          type="button"
          className={styles.small}
          onClick={onCollapse}
          aria-label="Свернуть диалог"
          title="Свернуть диалог"
        >
          →
        </button>
      </div>
      <div ref={bodyRef} className={styles.body}>
        {visible.length === 0 && <p className={styles.empty}>Вопроса ещё не было.</p>}
        {visible.map((turn) => (
          <TurnView
            key={turn.turn}
            turn={turn}
            events={events}
            shown={shown}
            live={live}
            clock={clock}
            schedule={schedule}
            onJump={() => {
              clock.seek(timeAt(schedule, turn.askedAt));
            }}
          />
        ))}
        {request}
      </div>
      <Composer mode={mode} sessionId={sessionId} />
    </aside>
  );
}

function isAnswered(turn: { answeredIndex: number | null }, shown: number): boolean {
  return turn.answeredIndex !== null && turn.answeredIndex < shown;
}

// Новая реплика — колонка доезжает до низа.
function useAutoScroll(count: number) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const body = ref.current;
    if (body !== null) {
      body.scrollTo({ top: body.scrollHeight, behavior: 'smooth' });
    }
  }, [count]);
  return ref;
}

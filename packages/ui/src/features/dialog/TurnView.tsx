// Ход диалога: вопрос пузырём, пока ответа нет — строка «что харнесс делает сейчас» со
// временем, потом ответ, итог хода и перемотка к нему на схеме.

import type { HarnessEvent } from '@harness-visualization/harness';
import { useEffect, useState, type ReactElement } from 'react';
import { MarkdownView } from '../../help/MarkdownView';
import { turnStatus, type DialogTurn } from '../../projections/projectDialog';
import { realAt, type Schedule } from '../../timeline/schedule';
import type { TimelineClock } from '../../timeline/TimelineClock';
import { useClockValue } from '../../timeline/useTimeline';
import styles from './Dialog.module.css';

interface TurnViewProps {
  turn: DialogTurn;
  events: readonly HarnessEvent[];
  shown: number;
  live: boolean;
  clock: TimelineClock;
  schedule: Schedule;
  onJump: () => void;
}

export function TurnView({
  turn,
  events,
  shown,
  live,
  clock,
  schedule,
  onJump,
}: TurnViewProps): ReactElement {
  const answered = turn.answeredIndex !== null && turn.answeredIndex < shown;
  return (
    <article className={styles.turn} data-active={!answered}>
      <div className={styles.question}>{turn.question}</div>
      {answered ? (
        <div className={styles.answer}>
          <MarkdownView text={turn.answer ?? ''} />
          <div className={styles.meta}>
            <span>шагов {turn.steps}</span>
            <span>тулов {turn.tools}</span>
            <span>input {turn.inputTokens.toLocaleString('ru-RU')}</span>
            <span>{formatSeconds((turn.answeredAt ?? turn.askedAt) - turn.askedAt)}</span>
          </div>
          <button type="button" className={styles.jump} onClick={onJump}>
            смотреть ход {turn.turn} на схеме
          </button>
        </div>
      ) : (
        <div className={styles.status} aria-live="polite">
          <span className={styles.pulse} aria-hidden="true" />
          <span>{turnStatus(events, shown)}…</span>
          <Elapsed turn={turn} events={events} live={live} clock={clock} schedule={schedule} />
        </div>
      )}
    </article>
  );
}

interface ElapsedProps {
  turn: DialogTurn;
  events: readonly HarnessEvent[];
  live: boolean;
  clock: TimelineClock;
  schedule: Schedule;
}

// Сколько идёт ход. В повторе — по часам повтора (время записи), вживую — по настоящим часам.
function Elapsed({ turn, events, live, clock, schedule }: ElapsedProps): ReactElement {
  const following = useClockValue(clock, (state) => state.following);
  const replayed = useClockValue(clock, (state) => Math.floor(realAt(schedule, state.time) / 100));
  const now = useNow(live && following);
  const first = events[0];
  const real =
    live && following && first !== undefined ? now - Date.parse(first.timestamp) : replayed * 100;
  return <span className={styles.elapsed}>{formatSeconds(Math.max(0, real - turn.askedAt))}</span>;
}

function useNow(ticking: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!ticking) {
      return undefined;
    }
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 200);
    return () => {
      clearInterval(timer);
    };
  }, [ticking]);
  return now;
}

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} с`;
}

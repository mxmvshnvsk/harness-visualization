import { ModelActor } from '../models/ModelActor';
// Ход диалога: вопрос пузырём, пока ответа нет — строка «что харнесс делает сейчас» со
// временем, потом ответ, итог хода и перемотка к нему на схеме.

import type { AcceptanceCheckedPayload, HarnessEvent } from '@harness-visualization/harness';
import { useEffect, useState, type ReactElement } from 'react';
import { MarkdownView } from '../../help/MarkdownView';
import { turnStatus, type DialogTurn } from '../../projections/projectDialog';
import { realAt, type Schedule } from '../../timeline/schedule';
import type { TimelineClock } from '../../timeline/TimelineClock';
import { useClockValue } from '../../timeline/useTimeline';
import styles from './Dialog.module.css';
import { LiveStep, typingStatus, useTyping } from './LiveStep';
import { formatRu } from '../../text/formatNumber';

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
          <ModelActor
            event={turn.answeredIndex === null ? undefined : events[turn.answeredIndex]}
          />
          <MarkdownView text={turn.answer ?? ''} />
          <div className={styles.meta}>
            <span>шагов {turn.steps}</span>
            <span>тулов {turn.tools}</span>
            {turn.delegations > 0 && <span>поручений {turn.delegations}</span>}
            <span>input {formatRu(turn.inputTokens)}</span>
            <span>{formatSeconds((turn.answeredAt ?? turn.askedAt) - turn.askedAt)}</span>
          </div>
          <button type="button" className={styles.jump} onClick={onJump}>
            смотреть ход {turn.turn} на схеме
          </button>
          {turn.acceptance !== null &&
            turn.acceptanceIndex !== null &&
            turn.acceptanceIndex < shown && <AcceptanceNote acceptance={turn.acceptance} />}
        </div>
      ) : (
        <Pending
          turn={turn}
          events={events}
          shown={shown}
          live={live}
          clock={clock}
          schedule={schedule}
        />
      )}
    </article>
  );
}

// Приёмка Код-арены (этап 10) под ответом: «готово» агента рядом с тем, что показали тесты
// харнесса. Подробно — во вкладке «Код».
function AcceptanceNote({ acceptance }: { acceptance: AcceptanceCheckedPayload }): ReactElement {
  const { visible, hidden } = acceptance;
  const failed = hidden.tests.filter((test) => !test.ok);
  return (
    <div className={styles.acceptance} data-ok={acceptance.passed}>
      <b>Приёмка харнессом: {acceptance.passed ? '✓ пройдена' : '✗ не пройдена'}</b>
      <span>
        видимые {visible.passed} из {visible.passed + visible.failed} · скрытые {hidden.passed} из{' '}
        {hidden.passed + hidden.failed}
      </span>
      {failed.map((test) => (
        <span key={test.name}>✗ {test.name}</span>
      ))}
      <span className={styles.acceptanceHint}>подробно — во вкладке «Код»</span>
    </div>
  );
}

// Ответа ещё нет: что печатает модель (этап 8d.3) и строка «что харнесс делает сейчас».
function Pending(props: Omit<TurnViewProps, 'onJump'>): ReactElement {
  const { turn, events, shown, live, clock, schedule } = props;
  const typing = useTyping({ events, shown, live, clock, schedule });
  return (
    <>
      {typing !== null && <LiveStep typing={typing} />}
      <div className={styles.status} aria-live="polite" data-phase={typing?.phase ?? ''}>
        <span className={styles.pulse} aria-hidden="true" />
        <span>{typing === null ? turnStatus(events, shown) : typingStatus(typing)}…</span>
        <Elapsed turn={turn} events={events} live={live} clock={clock} schedule={schedule} />
      </div>
    </>
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
  return `${formatRu(ms / 1000, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} с`;
}

// Шаг, который модель пишет прямо сейчас (этап 8d.3): рассуждение раскрыто и печатается,
// как началась фаза ответа — сворачивается в строку; ответ печатается по мере генерации.
// Когда приходит model_response, ход показывает собранный ответ как обычно.

import type { HarnessEvent } from '@harness-visualization/harness';
import type { ReactElement } from 'react';
import { useLiveDeltas } from '../../api/liveDeltas';
import type { EventOfType } from '../../events/eventTypes';
import {
  pendingStep,
  typingFromDeltas,
  typingFromTrace,
  type Typing,
} from '../../projections/projectTyping';
import { realAt, type Schedule } from '../../timeline/schedule';
import type { TimelineClock } from '../../timeline/TimelineClock';
import { useClockValue } from '../../timeline/useTimeline';
import { MarkdownView } from '../../help/MarkdownView';
import styles from './Dialog.module.css';

interface LiveStepProps {
  events: readonly HarnessEvent[];
  shown: number;
  live: boolean;
  clock: TimelineClock;
  schedule: Schedule;
}

export function useTyping(props: LiveStepProps): Typing | null {
  const { events, shown, live, clock, schedule } = props;
  const deltas = useLiveDeltas();
  const following = useClockValue(clock, (state) => state.following);
  // Время записи с точностью до 50 мс — чаще перерисовывать печать незачем.
  const real = useClockValue(clock, (state) => Math.floor(realAt(schedule, state.time) / 50) * 50);
  const request = pendingStep(events, shown);
  if (request === null) {
    return null;
  }
  if (live && following) {
    return typingFromDeltas(request, deltas[request.requestId]);
  }
  return typingFromTrace(request, events, real - sinceStart(events, request));
}

function sinceStart(
  events: readonly HarnessEvent[],
  request: EventOfType<'model_request'>,
): number {
  const first = events[0];
  return first === undefined ? 0 : Date.parse(request.timestamp) - Date.parse(first.timestamp);
}

export function LiveStep({ typing }: { typing: Typing }): ReactElement | null {
  if (typing.reasoning === '' && typing.answer === '') {
    return null;
  }
  const thinking = typing.phase === 'reasoning';
  return (
    <div className={styles.live}>
      {typing.reasoning !== '' && (
        <details className={styles.think} open={thinking}>
          <summary>{thinking ? 'рассуждает…' : 'рассуждение'}</summary>
          <p>
            {typing.reasoning}
            {thinking && <span className={styles.cursor} aria-hidden="true" />}
          </p>
        </details>
      )}
      {typing.answer !== '' && !typing.toolCalls && (
        <div className={styles.typed}>
          {/* Незакрытая разметка (**жирн) видна как есть, пока модель её не допишет. */}
          <MarkdownView text={typing.answer} />
          <span className={styles.cursor} aria-hidden="true" />
        </div>
      )}
    </div>
  );
}

const PHASE_STATUS = {
  wait: 'ждём первый токен',
  reasoning: 'модель рассуждает',
  answer: 'модель пишет ответ',
} as const;

// Строка состояния хода: фаза вместо безликого «модель думает».
export function typingStatus(typing: Typing): string {
  const phase =
    typing.phase === 'answer' && typing.toolCalls
      ? 'модель зовёт тулы'
      : PHASE_STATUS[typing.phase];
  return `${phase} · шаг ${String(typing.iteration ?? '?')}`;
}

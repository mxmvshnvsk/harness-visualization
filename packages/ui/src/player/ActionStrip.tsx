// Лента действий под плеером: каждое действие — отрезок цвета своей группы, ожидание — тонкая
// полоска, пройденное ярче. По ленте перематывают мышью или стрелками; под курсором видно,
// в какой момент сессии попадёшь и что там происходит. Бегунок движется по кадрам часов.

import { useEffect, useRef, type KeyboardEvent, type PointerEvent, type ReactElement } from 'react';
import { realAt, type Schedule } from '../timeline/schedule';
import type { TimelineClock } from '../timeline/TimelineClock';
import styles from './PlayerBar.module.css';

interface Segment {
  key: string;
  from: number;
  to: number;
  group: string;
  waiting: boolean;
  title: string;
}

export function ActionStrip({
  clock,
  schedule,
}: {
  clock: TimelineClock;
  schedule: Schedule;
}): ReactElement {
  const total = Math.max(1, schedule.total);
  const { stripRef, headRef, handlers } = useStripControls(clock, schedule, total);
  return (
    <div
      ref={stripRef}
      className={styles.strip}
      role="slider"
      tabIndex={0}
      aria-label="Позиция в сессии"
      aria-valuemin={0}
      aria-valuemax={100}
      {...handlers}
    >
      {segmentsOf(schedule).map((segment) => (
        <div
          key={segment.key}
          className={segment.waiting ? `${styles.segment} ${styles.waiting}` : styles.segment}
          data-group={segment.group}
          data-from={segment.from}
          title={segment.title}
          style={{
            left: `${String((segment.from / total) * 100)}%`,
            width: `${String(((segment.to - segment.from) / total) * 100)}%`,
          }}
        />
      ))}
      {questionMarks(schedule).map((at, index, marks) =>
        marks.length > 1 ? (
          <span key={at} className={styles.mark} style={{ left: `${String((at / total) * 100)}%` }}>
            вопрос {index + 1}
          </span>
        ) : null,
      )}
      <div ref={headRef} className={styles.head} />
      <div className={styles.ghost} data-ghost="line" />
      <div className={styles.ghostLabel} data-ghost="label" />
    </div>
  );
}

// Бегунок и пройденные отрезки — по кадрам часов, без перерисовки React.
function useStripControls(clock: TimelineClock, schedule: Schedule, total: number) {
  const stripRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const segments = [...(stripRef.current?.querySelectorAll<HTMLElement>('[data-from]') ?? [])];
    const draw = (): void => {
      const { time } = clock.getState();
      if (headRef.current !== null) {
        headRef.current.style.left = `${String((time / total) * 100)}%`;
      }
      stripRef.current?.setAttribute('aria-valuenow', String(Math.round((time / total) * 100)));
      for (const segment of segments) {
        segment.dataset.past = String(time >= Number(segment.dataset.from));
      }
    };
    draw();
    return clock.subscribe(draw);
  }, [clock, total]);
  return { stripRef, headRef, handlers: stripHandlers(clock, schedule, total) };
}

function stripHandlers(clock: TimelineClock, schedule: Schedule, total: number) {
  const timeOf = (event: PointerEvent<HTMLDivElement>): number => {
    const rect = event.currentTarget.getBoundingClientRect();
    return Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) * total;
  };
  return {
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>): void => {
      const delta = { ArrowRight: total / 50, ArrowLeft: -total / 50 }[event.key];
      if (delta !== undefined) {
        clock.seek(clock.getState().time + delta);
        event.preventDefault();
      }
    },
    onPointerDown: (event: PointerEvent<HTMLDivElement>): void => {
      event.currentTarget.setPointerCapture(event.pointerId);
      clock.seek(timeOf(event));
    },
    onPointerMove: (event: PointerEvent<HTMLDivElement>): void => {
      const time = timeOf(event);
      showGhost(event.currentTarget, schedule, time / total);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        clock.seek(time);
      }
    },
  };
}

function showGhost(strip: HTMLElement, schedule: Schedule, share: number): void {
  const line = strip.querySelector<HTMLElement>('[data-ghost="line"]');
  const label = strip.querySelector<HTMLElement>('[data-ghost="label"]');
  if (line === null || label === null) {
    return;
  }
  const time = share * schedule.total;
  line.style.left = `${String(share * 100)}%`;
  label.style.left = `${String(Math.min(90, Math.max(10, share * 100)))}%`;
  const seconds = (realAt(schedule, time) / 1000).toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  label.textContent = `${seconds} с · ${actionAt(schedule, time) ?? 'начало сессии'}`;
}

// Что происходит в этот момент повтора: последнее начавшееся действие.
function actionAt(schedule: Schedule, time: number): string | null {
  let found: string | null = null;
  for (const item of schedule.actions) {
    if (item.outFrom > time) {
      break;
    }
    const back = item.backFrom !== null && time >= item.backFrom;
    found = back ? (item.action.whatBack ?? item.action.what) : item.action.what;
  }
  return found;
}

// Где начинается каждый вопрос диалога: первый — сообщение пользователя, следующие — обратный
// полёт после «читает ответ…».
function questionMarks(schedule: Schedule): number[] {
  const marks: number[] = [];
  for (const item of schedule.actions) {
    if (item.action.kind === 'message' && item.action.from === 'user') {
      marks.push(item.outFrom);
    }
    if (item.action.id.startsWith('reading:') && item.backFrom !== null) {
      marks.push(item.backFrom);
    }
  }
  return marks.sort((left, right) => left - right);
}

function segmentsOf(schedule: Schedule): Segment[] {
  const segments: Segment[] = [];
  for (const item of schedule.actions) {
    const { action } = item;
    const base = { group: action.group, waiting: false };
    segments.push({
      ...base,
      key: `${action.id}:out`,
      from: item.outFrom,
      to: item.outTo,
      title: action.what,
    });
    if (item.backFrom !== null && item.backTo !== null) {
      segments.push({
        ...base,
        key: `${action.id}:wait`,
        from: item.outTo,
        to: item.backFrom,
        waiting: true,
        title: `${action.what} — ожидание`,
      });
      segments.push({
        ...base,
        key: `${action.id}:back`,
        from: item.backFrom,
        to: item.backTo,
        title: action.whatBack ?? action.what,
      });
    }
  }
  return segments;
}

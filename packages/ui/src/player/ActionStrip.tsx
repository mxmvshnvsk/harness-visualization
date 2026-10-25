// Лента действий под плеером: каждое действие — отрезок цвета своей группы, ожидание — тонкая
// полоска. По ленте перематывают мышью или стрелками; бегунок движется по кадрам часов.

import { useEffect, useRef, type KeyboardEvent, type PointerEvent, type ReactElement } from 'react';
import type { Schedule } from '../timeline/schedule';
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
  const { stripRef, headRef, handlers } = useStripControls(clock, total);
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
          title={segment.title}
          style={{
            left: `${String((segment.from / total) * 100)}%`,
            width: `${String(((segment.to - segment.from) / total) * 100)}%`,
          }}
        />
      ))}
      <div ref={headRef} className={styles.head} />
    </div>
  );
}

// Бегунок по кадрам часов, перемотка мышью (с захватом указателя) и стрелками.
function useStripControls(clock: TimelineClock, total: number) {
  const stripRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const draw = (): void => {
      const share = clock.getState().time / total;
      if (headRef.current !== null) {
        headRef.current.style.left = `${String(share * 100)}%`;
      }
      stripRef.current?.setAttribute('aria-valuenow', String(Math.round(share * 100)));
    };
    draw();
    return clock.subscribe(draw);
  }, [clock, total]);

  const seekTo = (event: PointerEvent<HTMLDivElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    clock.seek(((event.clientX - rect.left) / rect.width) * total);
  };
  const handlers = {
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>): void => {
      const delta = { ArrowRight: total / 50, ArrowLeft: -total / 50 }[event.key];
      if (delta !== undefined) {
        clock.seek(clock.getState().time + delta);
        event.preventDefault();
      }
    },
    onPointerDown: (event: PointerEvent<HTMLDivElement>): void => {
      event.currentTarget.setPointerCapture(event.pointerId);
      seekTo(event);
    },
    onPointerMove: (event: PointerEvent<HTMLDivElement>): void => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        seekTo(event);
      }
    },
  };
  return { stripRef, headRef, handlers };
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

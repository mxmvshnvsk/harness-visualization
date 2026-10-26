// Лента действий под плеером: каждое действие — отрезок цвета своей группы, ожидание — тонкая
// полоска, пройденное ярче. По ленте перематывают мышью или стрелками; под курсором видно,
// в какой момент сессии попадёшь и что там происходит. Бегунок движется по кадрам часов.
//
// Длинную сессию можно приблизить: отрезки лежат на дорожке шире ленты, окно (stripWindow.ts)
// сдвигает и растягивает дорожку — прямо в DOM, без перерисовки React.

import { useEffect, useMemo, useRef, type ReactElement, type RefObject } from 'react';
import { useAgentLabels } from '../features/agents/agentLabels';
import type { Schedule } from '../timeline/schedule';
import type { TimelineClock } from '../timeline/TimelineClock';
import styles from './PlayerBar.module.css';
import { questionMarks, segmentsOf, type Segment } from './stripSegments';
import { followHead, needsZoom, zoomActive, type StripView } from './stripWindow';
import { useStripPointer, useStripWheel } from './useStripGestures';

interface ActionStripProps {
  clock: TimelineClock;
  schedule: Schedule;
  view: StripView;
}

export function ActionStrip({ clock, schedule, view }: ActionStripProps): ReactElement {
  const total = Math.max(1, schedule.total);
  const labels = useAgentLabels();
  const segments = useMemo(() => segmentsOf(schedule, labels), [schedule, labels]);
  const stripRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  useZoomThreshold(stripRef, view, total, segments);
  useTrackWindow(stripRef, trackRef, view);
  useHead(clock, view, total, { trackRef, headRef, stripRef });
  useStripWheel(stripRef, view);
  const handlers = useStripPointer(clock, schedule, view);
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
      <div className={styles.viewport}>
        <div ref={trackRef} className={styles.track}>
          <div className={styles.bars}>
            {segments.map((segment) => (
              <SegmentBar key={segment.key} segment={segment} total={total} />
            ))}
          </div>
          {questionMarks(schedule).map((at, index, marks) =>
            marks.length > 1 ? (
              <span key={at} className={styles.mark} style={{ left: percent(at, total) }}>
                вопрос {index + 1}
              </span>
            ) : null,
          )}
          <div ref={headRef} className={styles.headRail}>
            <div className={styles.head} />
          </div>
        </div>
      </div>
      <div className={styles.ghost} data-ghost="line" />
      <div className={styles.ghostLabel} data-ghost="label" />
    </div>
  );
}

function SegmentBar({ segment, total }: { segment: Segment; total: number }): ReactElement {
  return (
    <div
      className={segment.waiting ? `${styles.segment} ${styles.waiting}` : styles.segment}
      data-group={segment.group}
      data-agent={segment.agent ?? undefined}
      data-from={segment.from}
      title={segment.title}
      style={{
        left: percent(segment.from, total),
        width: percent(segment.to - segment.from, total),
      }}
    />
  );
}

function percent(value: number, total: number): string {
  return `${String((value / total) * 100)}%`;
}

// Нужен ли зум — по ширине ленты и самому короткому отрезку; лента меняет ширину — проверяем снова.
function useZoomThreshold(
  stripRef: RefObject<HTMLDivElement | null>,
  view: StripView,
  total: number,
  segments: readonly Segment[],
): void {
  useEffect(() => {
    view.setTotal(total);
    const strip = stripRef.current;
    if (strip === null) {
      return undefined;
    }
    const durations = segments.filter((item) => !item.waiting).map((item) => item.to - item.from);
    const check = (): void => {
      view.setEnabled(needsZoom(durations, total, strip.clientWidth));
    };
    check();
    const observer = new ResizeObserver(check);
    observer.observe(strip);
    return () => {
      observer.disconnect();
    };
  }, [stripRef, view, total, segments]);
}

// Окно → положение и ширина дорожки.
function useTrackWindow(
  stripRef: RefObject<HTMLDivElement | null>,
  trackRef: RefObject<HTMLDivElement | null>,
  view: StripView,
): void {
  useEffect(() => {
    const draw = (): void => {
      const state = view.get();
      const { win, total } = state;
      const span = Math.max(1, win.to - win.from);
      if (trackRef.current !== null) {
        trackRef.current.style.left = `${String((-win.from / span) * 100)}%`;
        trackRef.current.style.width = `${String((total / span) * 100)}%`;
      }
      stripRef.current?.setAttribute('data-zoom', String(zoomActive(state)));
    };
    draw();
    return view.subscribe(draw);
  }, [stripRef, trackRef, view]);
}

interface HeadRefs {
  stripRef: RefObject<HTMLDivElement | null>;
  trackRef: RefObject<HTMLDivElement | null>;
  headRef: RefObject<HTMLDivElement | null>;
}

// Бегунок и пройденные отрезки — по кадрам часов; при воспроизведении окно едет за бегунком.
// В DOM пишем только то, что изменилось: запись атрибута, даже того же значения, заставляет
// браузер пересчитать стили, а отрезков в длинной сессии — сотни, кадров — 60 в секунду.
function useHead(clock: TimelineClock, view: StripView, total: number, refs: HeadRefs): void {
  const { stripRef, trackRef, headRef } = refs;
  useEffect(() => {
    const segments = [...(trackRef.current?.querySelectorAll<HTMLElement>('[data-from]') ?? [])];
    const starts = segments.map((segment) => Number(segment.dataset.from));
    const past = segments.map(() => null as boolean | null);
    let valueNow = '';
    const draw = (): void => {
      const { time, playing, following } = clock.getState();
      // Бегунок едет сдвигом слоя (transform), а не left: так кадр собирает компоновщик,
      // без раскладки и перерисовки «стеклянного» дока с размытием под ним.
      if (headRef.current !== null) {
        headRef.current.style.transform = `translateX(${percent(time, total)})`;
      }
      const nextValue = String(Math.round((time / total) * 100));
      if (nextValue !== valueNow) {
        valueNow = nextValue;
        stripRef.current?.setAttribute('aria-valuenow', nextValue);
      }
      segments.forEach((segment, index) => {
        const isPast = time >= (starts[index] ?? 0);
        if (past[index] !== isPast) {
          past[index] = isPast;
          segment.dataset.past = String(isPast);
        }
      });
      const state = view.get();
      if (zoomActive(state) && state.follow && (playing || following)) {
        view.setWindow(followHead(state.win, time, state.total));
      }
    };
    draw();
    return clock.subscribe(draw);
  }, [clock, view, total, stripRef, trackRef, headRef]);
}

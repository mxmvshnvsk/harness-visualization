// Мини-карта под лентой, когда включён зум: вся сессия тонкой полоской и рамка видимого окна.
// Рамку тянут целиком или за край; щелчок мимо рамки переносит окно в эту точку.

import { useEffect, useMemo, useRef, type PointerEvent, type ReactElement } from 'react';
import { useAgentLabels } from '../features/agents/agentLabels';
import type { Schedule } from '../timeline/schedule';
import type { TimelineClock } from '../timeline/TimelineClock';
import styles from './PlayerBar.module.css';
import { segmentsOf } from './stripSegments';
import { centerOn, dragMinimap, type MinimapDrag, type StripWindow } from './stripWindow';
import type { StripView } from './stripWindow';
import { useViewValue } from './useViewValue';

interface MinimapProps {
  clock: TimelineClock;
  schedule: Schedule;
  view: StripView;
}

export function StripMinimap(props: MinimapProps): ReactElement | null {
  const enabled = useViewValue(props.view, (state) => state.enabled);
  return enabled ? <MinimapBody {...props} /> : null;
}

function MinimapBody({ clock, schedule, view }: MinimapProps): ReactElement {
  const total = Math.max(1, schedule.total);
  const labels = useAgentLabels();
  const segments = useMemo(
    () => segmentsOf(schedule, labels).filter((item) => !item.waiting),
    [schedule, labels],
  );
  const windowRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const draw = (): void => {
      const { win } = view.get();
      if (windowRef.current !== null) {
        windowRef.current.style.left = `${String((win.from / total) * 100)}%`;
        windowRef.current.style.width = `${String(((win.to - win.from) / total) * 100)}%`;
      }
    };
    draw();
    return view.subscribe(draw);
  }, [view, total]);
  useEffect(() => {
    const draw = (): void => {
      if (headRef.current !== null) {
        headRef.current.style.left = `${String((clock.getState().time / total) * 100)}%`;
      }
    };
    draw();
    return clock.subscribe(draw);
  }, [clock, total]);
  return (
    <div className={styles.minimap} aria-hidden="true" {...useMinimapDrag(view)}>
      {segments.map((segment) => (
        <div
          key={segment.key}
          className={`${styles.segment} ${styles.mini}`}
          data-group={segment.group}
          style={{
            left: `${String((segment.from / total) * 100)}%`,
            width: `${String(((segment.to - segment.from) / total) * 100)}%`,
          }}
        />
      ))}
      <div ref={windowRef} className={styles.minimapWindow}>
        <span className={styles.edge} data-edge="from" />
        <span className={styles.edge} data-edge="to" />
      </div>
      <div ref={headRef} className={styles.minimapHead} />
    </div>
  );
}

interface MinimapGrab {
  mode: MinimapDrag;
  win: StripWindow;
  time: number;
}

function useMinimapDrag(view: StripView) {
  const grab = useRef<MinimapGrab | null>(null);
  const timeOf = (event: PointerEvent<HTMLElement>): number => {
    const rect = event.currentTarget.getBoundingClientRect();
    const share = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    return share * view.get().total;
  };
  return {
    onPointerDown: (event: PointerEvent<HTMLElement>): void => {
      event.currentTarget.setPointerCapture(event.pointerId);
      const time = timeOf(event);
      const target = event.target as HTMLElement;
      const edge = target.dataset.edge;
      const inside = target.closest(`.${styles.minimapWindow}`) !== null;
      const { win, total } = view.get();
      view.setFollow(false);
      if (!inside) {
        view.setWindow(centerOn(win, time, total));
      }
      const mode: MinimapDrag = edge === 'from' || edge === 'to' ? edge : 'move';
      grab.current = { mode, win: view.get().win, time };
    },
    onPointerMove: (event: PointerEvent<HTMLElement>): void => {
      if (grab.current !== null && event.currentTarget.hasPointerCapture(event.pointerId)) {
        view.setWindow(
          dragMinimap(grab.current.mode, grab.current, timeOf(event), view.get().total),
        );
      }
    },
    onPointerUp: (): void => {
      grab.current = null;
    },
  };
}

// Зум ленты в строке кнопок плеера: отдалить, ширина окна, приблизить, вся сессия и «к бегунку»,
// если окно перестало ехать за ним. Видны, только когда зум нужен (stripWindow.ts).

import { useEffect, useRef, type ReactElement } from 'react';
import { realAt, type Schedule } from '../timeline/schedule';
import type { TimelineClock } from '../timeline/TimelineClock';
import { IconButton } from './IconButton';
import styles from './PlayerBar.module.css';
import { centerOn, zoomAround, type StripView } from './stripWindow';
import { useViewValue } from './useViewValue';

interface ZoomControlsProps {
  clock: TimelineClock;
  schedule: Schedule;
  view: StripView;
}

export function ZoomControls({ clock, schedule, view }: ZoomControlsProps): ReactElement | null {
  const enabled = useViewValue(view, (state) => state.enabled);
  const follow = useViewValue(view, (state) => state.follow);
  if (!enabled) {
    return null;
  }
  // Кнопки зумят вокруг бегунка, если он в окне, иначе — вокруг середины окна.
  const zoom = (factor: number): void => {
    const { win, total } = view.get();
    const time = clock.getState().time;
    const at = time >= win.from && time <= win.to ? time : (win.from + win.to) / 2;
    view.setWindow(zoomAround(win, factor, at, total));
  };
  return (
    <div className={styles.zoom} role="group" aria-label="Зум ленты">
      <IconButton label="Отдалить (−)" path="M6 12h12" onClick={() => zoom(1.5)} />
      <WindowLabel schedule={schedule} view={view} />
      <IconButton label="Приблизить (+)" path="M12 6v12M6 12h12" onClick={() => zoom(1 / 1.5)} />
      <IconButton
        label="Вся сессия (0)"
        path="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4"
        onClick={() => {
          view.setWindow({ from: 0, to: view.get().total });
        }}
      />
      {follow ? null : (
        <button
          type="button"
          className={styles.follow}
          onClick={() => {
            const { win, total } = view.get();
            view.setWindow(centerOn(win, clock.getState().time, total));
            view.setFollow(true);
          }}
        >
          к бегунку
        </button>
      )}
    </div>
  );
}

// «окно 12,3 с» — сколько времени записи видно на ленте.
function WindowLabel({ schedule, view }: { schedule: Schedule; view: StripView }): ReactElement {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const draw = (): void => {
      const { win } = view.get();
      const seconds = (realAt(schedule, win.to) - realAt(schedule, win.from)) / 1000;
      if (ref.current !== null) {
        ref.current.textContent = `окно ${seconds.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} с`;
      }
    };
    draw();
    return view.subscribe(draw);
  }, [schedule, view]);
  return <span ref={ref} className={styles.windowLabel} />;
}

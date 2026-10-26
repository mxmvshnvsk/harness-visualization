// Кнопки зума ленты: отдалить, ширина окна, приблизить, вся сессия и «к бегунку», если окно
// перестало ехать за ним. Видны, только когда зум нужен (stripWindow.ts). Общие для ленты
// плеера и дорожек вкладки «Агенты».

import { useEffect, useRef, type ReactElement } from 'react';
import { IconButton } from './IconButton';
import styles from './PlayerBar.module.css';
import { centerOn, zoomActive, zoomAround, type StripView, type StripWindow } from './stripWindow';
import { useViewValue } from './useViewValue';

interface ZoomControlsProps {
  view: StripView;
  // Подпись окна: сколько секунд записи видно.
  describe: (win: StripWindow) => string;
  // Где сейчас бегунок — вокруг него зумят кнопки и к нему возвращает «к бегунку».
  head: () => number;
}

export function ZoomControls({ view, describe, head }: ZoomControlsProps): ReactElement | null {
  const enabled = useViewValue(view, zoomActive);
  const follow = useViewValue(view, (state) => state.follow);
  if (!enabled) {
    return null;
  }
  // Вокруг бегунка, если он в окне, иначе — вокруг середины окна.
  const zoom = (factor: number): void => {
    const { win, total } = view.get();
    const time = head();
    const at = time >= win.from && time <= win.to ? time : (win.from + win.to) / 2;
    view.setWindow(zoomAround(win, factor, at, total));
  };
  return (
    <div className={styles.zoom} role="group" aria-label="Зум ленты">
      <IconButton label="Отдалить (−)" path="M6 12h12" onClick={() => zoom(1.5)} />
      <WindowLabel describe={describe} view={view} />
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
            view.setWindow(centerOn(win, head(), total));
            view.setFollow(true);
          }}
        >
          к бегунку
        </button>
      )}
    </div>
  );
}

export function formatWindow(ms: number): string {
  return `окно ${(ms / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} с`;
}

function WindowLabel(props: {
  describe: (win: StripWindow) => string;
  view: StripView;
}): ReactElement {
  const { describe, view } = props;
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const draw = (): void => {
      if (ref.current !== null) {
        ref.current.textContent = describe(view.get().win);
      }
    };
    draw();
    return view.subscribe(draw);
  }, [describe, view]);
  return <span ref={ref} className={styles.windowLabel} />;
}

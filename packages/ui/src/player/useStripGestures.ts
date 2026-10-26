// Жесты ленты плеера, когда включён зум (stripWindow.ts).
//
// Зум вокруг курсора: щипок трекпада (Chrome, Firefox и Edge присылают его колесом с ctrlKey,
// Safari — отдельными событиями gesture* со scale), колесо мыши с Ctrl (Windows, Linux) или
// с ⌘ / ⌥ (Mac — как в Logic и Figma). Сдвиг: свайп двумя пальцами влево-вправо (трекпад,
// Magic Mouse), Shift + колесо, перетаскивание ладонью. Без модификаторов вертикальное колесо
// прокручивает страницу — ленту не трогаем. Без зума лента ведёт себя как раньше: нажать
// и тянуть — перемотка.

import { useEffect, useRef, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { realAt, type Schedule } from '../timeline/schedule';
import type { TimelineClock } from '../timeline/TimelineClock';
import { actionAt } from './stripSegments';
import {
  DRAG_THRESHOLD_PX,
  panBy,
  wheelZoomFactor,
  zoomAround,
  type StripView,
  type StripWindow,
} from './stripWindow';

// Время под точкой ленты с учётом окна.
export function timeAtX(strip: HTMLElement, win: StripWindow, clientX: number): number {
  const rect = strip.getBoundingClientRect();
  const share = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  return win.from + share * (win.to - win.from);
}

// Зум колесом с модификатором или щипком, сдвиг свайпом — и браузер при этом не зумит страницу
// и не уходит «назад» по свайпу.
function handleWheel(event: WheelEvent, strip: HTMLElement, view: StripView): void {
  // strip — то, что измеряем: у дорожек «Агентов» события ловит весь блок, а время — по дорожке.
  const { enabled, win, total } = view.get();
  const zooming = event.ctrlKey || event.metaKey || event.altKey;
  const dx = event.shiftKey ? event.deltaY : event.deltaX;
  if (!enabled || (!zooming && dx === 0)) {
    return;
  }
  event.preventDefault();
  view.setFollow(false);
  if (zooming) {
    const at = timeAtX(strip, win, event.clientX);
    view.setWindow(zoomAround(win, wheelZoomFactor(event.deltaY, event.deltaMode), at, total));
    return;
  }
  view.setWindow(panBy(win, (dx / strip.clientWidth) * (win.to - win.from), total));
}

// Safari: GestureEvent нет в стандартных типах DOM.
interface GestureLike extends Event {
  scale: number;
  clientX: number;
}

// measure — элемент, по которому считать время под курсором; по умолчанию сама лента.
export function useStripWheel(
  stripRef: RefObject<HTMLElement | null>,
  view: StripView,
  measure?: () => HTMLElement | null,
): void {
  useEffect(() => {
    const area = stripRef.current;
    if (area === null) {
      return undefined;
    }
    const strip = measure?.() ?? area;
    let scale = 1;
    const onWheel = (event: WheelEvent): void => {
      handleWheel(event, strip, view);
    };
    const onGesture = (event: Event): void => {
      if (!view.get().enabled) {
        return;
      }
      event.preventDefault();
      const gesture = event as GestureLike;
      if (event.type === 'gesturestart') {
        scale = 1;
        return;
      }
      const { win, total } = view.get();
      view.setFollow(false);
      view.setWindow(
        zoomAround(win, scale / gesture.scale, timeAtX(strip, win, gesture.clientX), total),
      );
      scale = gesture.scale;
    };
    area.addEventListener('wheel', onWheel, { passive: false });
    for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
      area.addEventListener(type, onGesture);
    }
    return () => {
      area.removeEventListener('wheel', onWheel);
      for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
        area.removeEventListener(type, onGesture);
      }
    };
  }, [stripRef, view, measure]);
}

interface Drag {
  x: number;
  win: StripWindow;
  moved: boolean;
}

// Клавиши на ленте: ← → — перемотка на 1/50 окна, + − — зум вокруг бегунка, 0 — вся сессия.
function handleKey(event: KeyboardEvent<HTMLElement>, clock: TimelineClock, view: StripView): void {
  const { win, total, enabled } = view.get();
  const span = win.to - win.from;
  const time = clock.getState().time;
  const seek = { ArrowRight: span / 50, ArrowLeft: -span / 50 }[event.key];
  const zoom = enabled ? { '+': 1 / 1.5, '=': 1 / 1.5, '-': 1.5 }[event.key] : undefined;
  if (seek !== undefined) {
    clock.seek(time + seek);
  } else if (zoom !== undefined) {
    view.setFollow(false);
    view.setWindow(zoomAround(win, zoom, time, total));
  } else if (event.key === '0' && enabled) {
    view.setWindow({ from: 0, to: total });
  } else {
    return;
  }
  event.preventDefault();
}

export interface StripHandlers {
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  onDoubleClick: () => void;
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLElement>) => void;
}

export function useStripPointer(
  clock: TimelineClock,
  schedule: Schedule,
  view: StripView,
): StripHandlers {
  const drag = useRef<Drag | null>(null);
  const timeOf = (event: PointerEvent<HTMLElement>): number =>
    timeAtX(event.currentTarget, view.get().win, event.clientX);
  return {
    onKeyDown: (event: KeyboardEvent<HTMLElement>): void => {
      handleKey(event, clock, view);
    },
    onDoubleClick: (): void => {
      view.setWindow({ from: 0, to: view.get().total });
    },
    onPointerDown: (event: PointerEvent<HTMLElement>): void => {
      event.currentTarget.setPointerCapture(event.pointerId);
      const { enabled, win } = view.get();
      if (enabled) {
        drag.current = { x: event.clientX, win, moved: false };
      } else {
        clock.seek(timeOf(event));
      }
    },
    onPointerMove: (event: PointerEvent<HTMLElement>): void => {
      const time = timeOf(event);
      showGhost(event.currentTarget, schedule, view.get().win, time);
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
        return;
      }
      if (drag.current === null) {
        clock.seek(time);
        return;
      }
      dragStrip(drag.current, event, view);
    },
    onPointerUp: (event: PointerEvent<HTMLElement>): void => {
      const current = drag.current;
      drag.current = null;
      delete event.currentTarget.dataset.dragging;
      if (current !== null && !current.moved) {
        clock.seek(timeOf(event));
      }
    },
  };
}

// Сдвиг больше порога — перетаскивание ладонью: лента едет за курсором.
function dragStrip(drag: Drag, event: PointerEvent<HTMLElement>, view: StripView): void {
  const dx = event.clientX - drag.x;
  if (!drag.moved && Math.abs(dx) < DRAG_THRESHOLD_PX) {
    return;
  }
  drag.moved = true;
  event.currentTarget.dataset.dragging = 'true';
  view.setFollow(false);
  const span = drag.win.to - drag.win.from;
  view.setWindow(panBy(drag.win, (-dx / event.currentTarget.clientWidth) * span, view.get().total));
}

function showGhost(strip: HTMLElement, schedule: Schedule, win: StripWindow, time: number): void {
  const line = strip.querySelector<HTMLElement>('[data-ghost="line"]');
  const label = strip.querySelector<HTMLElement>('[data-ghost="label"]');
  if (line === null || label === null) {
    return;
  }
  const share = (time - win.from) / Math.max(1, win.to - win.from);
  line.style.left = `${String(share * 100)}%`;
  label.style.left = `${String(Math.min(90, Math.max(10, share * 100)))}%`;
  const seconds = (realAt(schedule, time) / 1000).toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  label.textContent = `${seconds} с · ${actionAt(schedule, time) ?? 'начало сессии'}`;
}

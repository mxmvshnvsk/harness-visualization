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
  isZoomed,
  panBy,
  wheelZoomFactor,
  zoomActive,
  zoomAround,
  type StripView,
  type StripWindow,
} from './stripWindow';
import { formatRu } from '../text/formatNumber';

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
  const state = view.get();
  const { win, total } = state;
  const zooming = event.ctrlKey || event.metaKey || event.altKey;
  const dx = event.shiftKey ? event.deltaY : event.deltaX;
  // Сдвигать есть что, только если приблизили; иначе свайп остаётся браузеру.
  if (!zooming && (dx === 0 || !isZoomed(state))) {
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
  const state = view.get();
  const { win, total } = state;
  const span = win.to - win.from;
  const time = clock.getState().time;
  const seek = { ArrowRight: span / 50, ArrowLeft: -span / 50 }[event.key];
  const zoom = { '+': 1 / 1.5, '=': 1 / 1.5, '-': 1.5 }[event.key];
  if (seek !== undefined) {
    clock.seek(time + seek);
  } else if (zoom !== undefined) {
    view.setFollow(false);
    view.setWindow(zoomAround(win, zoom, time, total));
  } else if (event.key === '0' && isZoomed(state)) {
    view.setWindow({ from: 0, to: total });
  } else {
    return;
  }
  event.preventDefault();
}

export interface StripHandlers {
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  onDoubleClick: () => void;
  onPointerEnter: (event: PointerEvent<HTMLElement>) => void;
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLElement>) => void;
}

// Последнее движение указателя: применяется раз в кадр, а не на каждое событие.
interface PendingMove {
  strip: HTMLElement;
  clientX: number;
  captured: boolean;
}

// Лента меряется при наведении и нажатии, а не на каждом движении: getBoundingClientRect после
// записи стилей в прошлом кадре заставлял браузер раскладывать сотни отрезков заново.
// Перемотка, сдвиг и подсказка под курсором — раз в кадр (профиль 26.10.2026: на каждое
// движение мыши перерисовывался весь экран).
export function useStripPointer(
  clock: TimelineClock,
  schedule: Schedule,
  view: StripView,
): StripHandlers {
  const drag = useRef<Drag | null>(null);
  const rect = useRef<DOMRect | null>(null);
  const measure = (strip: HTMLElement): DOMRect => {
    rect.current = strip.getBoundingClientRect();
    return rect.current;
  };
  const timeAt = (strip: HTMLElement, clientX: number): number =>
    timeAtRect(rect.current ?? measure(strip), view.get().win, clientX);
  const moves = useOncePerFrame<PendingMove>((move) => {
    const width = rect.current?.width ?? 1;
    applyMove(
      move,
      timeAt(move.strip, move.clientX),
      { clock, schedule, view, width },
      drag.current,
    );
  });
  return {
    onKeyDown: (event: KeyboardEvent<HTMLElement>): void => {
      handleKey(event, clock, view);
    },
    onDoubleClick: (): void => {
      view.setWindow({ from: 0, to: view.get().total });
    },
    onPointerEnter: (event: PointerEvent<HTMLElement>): void => {
      measure(event.currentTarget);
    },
    onPointerDown: (event: PointerEvent<HTMLElement>): void => {
      event.currentTarget.setPointerCapture(event.pointerId);
      measure(event.currentTarget);
      const { win } = view.get();
      if (zoomActive(view.get())) {
        drag.current = { x: event.clientX, win, moved: false };
      } else {
        clock.seek(timeAt(event.currentTarget, event.clientX));
      }
    },
    onPointerMove: (event: PointerEvent<HTMLElement>): void => {
      moves.schedule({
        strip: event.currentTarget,
        clientX: event.clientX,
        captured: event.currentTarget.hasPointerCapture(event.pointerId),
      });
    },
    onPointerUp: (event: PointerEvent<HTMLElement>): void => {
      moves.flush();
      const current = drag.current;
      drag.current = null;
      delete event.currentTarget.dataset.dragging;
      if (current !== null && !current.moved) {
        clock.seek(timeAt(event.currentTarget, event.clientX));
      }
    },
  };
}

interface MoveContext {
  clock: TimelineClock;
  schedule: Schedule;
  view: StripView;
  width: number;
}

// Движение за кадр: подсказка под курсором; с нажатой кнопкой — перемотка или сдвиг ленты.
function applyMove(move: PendingMove, time: number, context: MoveContext, drag: Drag | null): void {
  showGhost(move.strip, context.schedule, context.view.get().win, time);
  if (!move.captured) {
    return;
  }
  if (drag === null) {
    context.clock.seek(time);
  } else {
    dragStrip(drag, move, context.width, context.view);
  }
}

// Последнее из значений за кадр — в run один раз, в начале следующего кадра; flush — сразу.
function useOncePerFrame<Value>(run: (value: Value) => void): {
  schedule: (value: Value) => void;
  flush: () => void;
} {
  const pending = useRef<{ value: Value } | null>(null);
  const frame = useRef<number | null>(null);
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  });
  useEffect(
    () => () => {
      if (frame.current !== null) {
        cancelAnimationFrame(frame.current);
      }
    },
    [],
  );
  const flush = (): void => {
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    const next = pending.current;
    pending.current = null;
    if (next !== null) {
      runRef.current(next.value);
    }
  };
  return {
    schedule: (value) => {
      pending.current = { value };
      frame.current ??= requestAnimationFrame(flush);
    },
    flush,
  };
}

// Время под точкой по уже измеренной ленте.
function timeAtRect(rect: DOMRect, win: StripWindow, clientX: number): number {
  const share = Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(1, rect.width)));
  return win.from + share * (win.to - win.from);
}

// Сдвиг больше порога — перетаскивание ладонью: лента едет за курсором.
function dragStrip(drag: Drag, move: PendingMove, width: number, view: StripView): void {
  const dx = move.clientX - drag.x;
  if (!drag.moved && Math.abs(dx) < DRAG_THRESHOLD_PX) {
    return;
  }
  if (!drag.moved) {
    drag.moved = true;
    move.strip.dataset.dragging = 'true';
    view.setFollow(false);
  }
  const span = drag.win.to - drag.win.from;
  view.setWindow(panBy(drag.win, (-dx / width) * span, view.get().total));
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
  const seconds = formatRu(realAt(schedule, time) / 1000, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  label.textContent = `${seconds} с · ${actionAt(schedule, time) ?? 'начало сессии'}`;
}

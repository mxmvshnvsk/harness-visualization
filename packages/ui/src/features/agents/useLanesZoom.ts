// Зум дорожек вкладки «Агенты» — то же окно и те же жесты, что у ленты плеера
// (player/stripWindow.ts, player/useStripGestures.ts). Время здесь настоящее, мс от начала сессии.
// Окно сдвигает и растягивает слой с отрезками в каждой дорожке — прямо в DOM.

import { useCallback, useEffect, useRef, type PointerEvent, type RefObject } from 'react';
import {
  DRAG_THRESHOLD_PX,
  followHead,
  needsZoom,
  panBy,
  type StripView,
  type StripWindow,
} from '../../player/stripWindow';
import { useStripWheel } from '../../player/useStripGestures';
import type { AgentsView } from '../../projections/projectAgents';

export interface LanesPointer {
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLElement>) => void;
  onDoubleClick: () => void;
}

const LAYER = '[data-zoom-layer]';

export function useLanesZoom(
  lanesRef: RefObject<HTMLDivElement | null>,
  zoom: StripView,
  view: AgentsView,
): LanesPointer {
  const total = Math.max(view.now, 1);
  // Время под курсором — по ширине дорожки, а не всего блока с подписями агентов.
  const measure = useCallback(
    () => lanesRef.current?.querySelector<HTMLElement>(LAYER)?.parentElement ?? null,
    [lanesRef],
  );
  useThreshold(lanesRef, zoom, view, total);
  useLayers(lanesRef, zoom);
  useStripWheel(lanesRef, zoom, measure);
  return useDragPan(zoom, measure);
}

// Зум нужен, когда самый короткий запрос к модели уже 6 px; окно едет за текущим моментом.
// Тулы не считаем: в записи они идут миллисекунды, их не растянуть и зумом — у них
// и без того есть минимальная ширина отрезка.
function useThreshold(
  lanesRef: RefObject<HTMLDivElement | null>,
  zoom: StripView,
  view: AgentsView,
  total: number,
): void {
  useEffect(() => {
    zoom.setTotal(total);
    const state = zoom.get();
    if (state.enabled && state.follow) {
      zoom.setWindow(followHead(state.win, view.now, total));
    }
    const track = lanesRef.current?.querySelector<HTMLElement>(LAYER)?.parentElement;
    if (track === undefined || track === null) {
      return undefined;
    }
    const durations = view.lanes.flatMap((lane) =>
      lane.segments
        .filter((segment) => segment.kind === 'model')
        .map((segment) => (segment.end ?? view.now) - segment.start),
    );
    const check = (): void => {
      zoom.setEnabled(needsZoom(durations, total, track.clientWidth));
    };
    check();
    const observer = new ResizeObserver(check);
    observer.observe(track);
    return () => {
      observer.disconnect();
    };
  }, [lanesRef, zoom, view, total]);
}

function useLayers(lanesRef: RefObject<HTMLDivElement | null>, zoom: StripView): void {
  useEffect(() => {
    const draw = (): void => {
      const { win, total, enabled } = zoom.get();
      const span = Math.max(1, win.to - win.from);
      for (const layer of lanesRef.current?.querySelectorAll<HTMLElement>(LAYER) ?? []) {
        layer.style.left = `${String((-win.from / span) * 100)}%`;
        layer.style.width = `${String((total / span) * 100)}%`;
      }
      lanesRef.current?.setAttribute('data-zoom', String(enabled));
    };
    draw();
    return zoom.subscribe(draw);
  });
}

interface Drag {
  x: number;
  win: StripWindow;
}

// Перетаскивание ладонью: сдвиг больше порога — лента едет за курсором.
function useDragPan(zoom: StripView, measure: () => HTMLElement | null): LanesPointer {
  const drag = useRef<Drag | null>(null);
  return {
    onPointerDown: (event) => {
      if (zoom.get().enabled && event.button === 0) {
        drag.current = { x: event.clientX, win: zoom.get().win };
      }
    },
    onPointerMove: (event) => {
      const current = drag.current;
      const width = measure()?.clientWidth ?? 0;
      const dx = event.clientX - (current?.x ?? event.clientX);
      if (current === null || width === 0 || Math.abs(dx) < DRAG_THRESHOLD_PX) {
        return;
      }
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.dataset.dragging = 'true';
      }
      zoom.setFollow(false);
      const span = current.win.to - current.win.from;
      zoom.setWindow(panBy(current.win, (-dx / width) * span, zoom.get().total));
    },
    onPointerUp: (event) => {
      drag.current = null;
      delete event.currentTarget.dataset.dragging;
    },
    onDoubleClick: () => {
      zoom.setWindow({ from: 0, to: zoom.get().total });
    },
  };
}

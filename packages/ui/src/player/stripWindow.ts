// Окно ленты плеера: какой кусок сессии виден, когда она длинная. Зум — как в аудиоредакторах:
// вокруг курсора, время под ним остаётся на месте. По вопросу автора и мокапу, одобренному
// им 26.10.2026 (https://claude.ai/artifact/LoY58mTraFkZEjQPv75SbY).
//
// Порог — по пикселям, а не по длине сессии: когда самый короткий отрезок на ленте уже
// MIN_SEGMENT_PX, в него не попасть мышью — тогда кнопки зума и мини-карта появляются сами.
// Жесты зума работают всегда, на любой ширине: ширина ленты разная на разных вкладках и в
// свёрнутом плеере, и зум, который то есть, то нет, выглядит поломкой (замечание автора,
// 26.10.2026). Приблизили жестом — кнопки появляются, чтобы было как вернуться.

export interface StripWindow {
  from: number;
  to: number;
}

export interface StripViewState {
  win: StripWindow;
  total: number;
  // Порог: короткие отрезки на ленте слишком узкие — зум подсказан.
  enabled: boolean;
  // Окно само едет за бегунком при воспроизведении; ручной сдвиг или зум это выключают.
  follow: boolean;
}

export const MIN_SEGMENT_PX = 6;
// Уже окна не зумим, мс повтора: дальше отрезки только растягиваются.
export const MIN_WINDOW_MS = 1500;
// Сдвиг больше этого — перетаскивание ленты, меньше — клик и перемотка.
export const DRAG_THRESHOLD_PX = 4;

// Видна не вся сессия.
export function isZoomed(state: StripViewState): boolean {
  return state.win.from > 0 || state.win.to < state.total;
}

// Показывать кнопки, мини-карту и перетаскивание: зум подсказан порогом или уже приблизили.
export function zoomActive(state: StripViewState): boolean {
  return state.enabled || isZoomed(state);
}

export function needsZoom(durations: readonly number[], total: number, widthPx: number): boolean {
  const positive = durations.filter((duration) => duration > 0);
  if (positive.length === 0 || total <= 0 || widthPx <= 0) {
    return false;
  }
  return (Math.min(...positive) / total) * widthPx < MIN_SEGMENT_PX;
}

export function clampWindow(win: StripWindow, total: number): StripWindow {
  const span = Math.min(total, Math.max(Math.min(MIN_WINDOW_MS, total), win.to - win.from));
  const from = Math.min(total - span, Math.max(0, win.from));
  return { from, to: from + span };
}

// factor < 1 — приблизить, > 1 — отдалить; at — время под курсором, оно остаётся на месте.
export function zoomAround(
  win: StripWindow,
  factor: number,
  at: number,
  total: number,
): StripWindow {
  const span = win.to - win.from;
  const next = clampWindow({ from: 0, to: span * factor }, total).to;
  const ratio = next / span;
  const from = at - (at - win.from) * ratio;
  return clampWindow({ from, to: from + next }, total);
}

export function panBy(win: StripWindow, delta: number, total: number): StripWindow {
  return clampWindow({ from: win.from + delta, to: win.to + delta }, total);
}

// Бегунок ушёл за край окна — окно перелистывается, бегунок оказывается у левого края.
export function followHead(win: StripWindow, time: number, total: number): StripWindow {
  const span = win.to - win.from;
  if (time >= win.from && time <= win.to) {
    return win;
  }
  const from = time - span * 0.1;
  return clampWindow({ from, to: from + span }, total);
}

export function centerOn(win: StripWindow, time: number, total: number): StripWindow {
  const span = win.to - win.from;
  return clampWindow({ from: time - span / 2, to: time + span / 2 }, total);
}

export type MinimapDrag = 'move' | 'from' | 'to';

// Мини-карта: окно тянут целиком или за край; start — время, где нажали, time — где курсор сейчас.
export function dragMinimap(
  mode: MinimapDrag,
  start: { win: StripWindow; time: number },
  time: number,
  total: number,
): StripWindow {
  const { win } = start;
  const min = Math.min(MIN_WINDOW_MS, total);
  if (mode === 'from') {
    return clampWindow({ from: Math.min(time, win.to - min), to: win.to }, total);
  }
  if (mode === 'to') {
    return clampWindow({ from: win.from, to: Math.max(time, win.from + min) }, total);
  }
  return panBy(win, time - start.time, total);
}

// Шаг колеса мыши — около 100 px, шаг щипка трекпада — единицы; ограничиваем, чтобы один
// щелчок колеса не прыгал. deltaMode 1 — строки (Firefox), 33 px на строку.
export function wheelZoomFactor(deltaY: number, deltaMode: number): number {
  const delta = deltaMode === 1 ? deltaY * 33 : deltaY;
  return Math.exp(Math.max(-60, Math.min(60, delta)) * 0.008);
}

type Listener = () => void;

export interface StripView {
  get: () => StripViewState;
  setWindow: (win: StripWindow) => void;
  setTotal: (total: number) => void;
  setEnabled: (enabled: boolean) => void;
  setFollow: (follow: boolean) => void;
  subscribe: (listener: Listener) => () => void;
}

export function createStripView(): StripView {
  let state: StripViewState = { win: { from: 0, to: 1 }, total: 1, enabled: false, follow: true };
  const listeners = new Set<Listener>();
  const update = (next: Partial<StripViewState>): void => {
    state = { ...state, ...next };
    for (const listener of listeners) {
      listener();
    }
  };
  return {
    get: () => state,
    setWindow: (win) => {
      update({ win: clampWindow(win, state.total) });
    },
    setTotal: (total) => {
      // Видна вся сессия — она и остаётся видна целиком, пока растёт.
      const whole = state.win.from <= 0 && state.win.to >= state.total;
      update({ total, win: whole ? { from: 0, to: total } : clampWindow(state.win, total) });
    },
    setEnabled: (enabled) => {
      if (enabled !== state.enabled) {
        // Порог пропал (лента стала шире) — окно не сбрасываем: приближение остаётся.
        update({ enabled });
      }
    },
    setFollow: (follow) => {
      update({ follow });
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

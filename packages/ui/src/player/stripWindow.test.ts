import { describe, expect, it } from 'vitest';
import {
  clampWindow,
  createStripView,
  dragMinimap,
  followHead,
  MIN_WINDOW_MS,
  needsZoom,
  panBy,
  zoomActive,
  zoomAround,
} from './stripWindow';

describe('needsZoom', () => {
  it('короткая сессия на широкой ленте — зум не нужен', () => {
    // 17 с, отрезок 0,3 с на 1000 px — около 18 px.
    expect(needsZoom([300, 2000], 17_000, 1000)).toBe(false);
  });

  it('длинная сессия — короткий отрезок уже 6 px, зум нужен', () => {
    // 91,6 с, отрезок 0,4 с на 1000 px — около 4 px.
    expect(needsZoom([400, 5000], 91_600, 1000)).toBe(true);
  });

  it('та же сессия на телефоне — порог по пикселям, а не по секундам', () => {
    expect(needsZoom([300], 17_000, 300)).toBe(true);
  });

  it('пустая лента — зум не нужен', () => {
    expect(needsZoom([], 0, 1000)).toBe(false);
  });
});

describe('окно ленты', () => {
  const total = 90_000;

  it('зум сохраняет время под курсором на месте', () => {
    const win = zoomAround({ from: 0, to: total }, 0.5, 30_000, total);
    expect(win.to - win.from).toBe(45_000);
    // Курсор был на трети окна — там и остался.
    expect((30_000 - win.from) / (win.to - win.from)).toBeCloseTo(1 / 3);
  });

  it('не уже MIN_WINDOW_MS и не шире сессии', () => {
    const narrow = zoomAround({ from: 0, to: 2000 }, 0.1, 1000, total);
    expect(narrow.to - narrow.from).toBe(MIN_WINDOW_MS);
    expect(zoomAround({ from: 10_000, to: 50_000 }, 10, 20_000, total)).toEqual({
      from: 0,
      to: total,
    });
  });

  it('сдвиг упирается в края сессии', () => {
    expect(panBy({ from: 0, to: 10_000 }, -5000, total)).toEqual({ from: 0, to: 10_000 });
    expect(panBy({ from: 70_000, to: 80_000 }, 50_000, total)).toEqual({
      from: 80_000,
      to: total,
    });
  });

  it('бегунок за краем — окно перелистывается к нему', () => {
    const win = { from: 0, to: 10_000 };
    expect(followHead(win, 5000, total)).toBe(win);
    expect(followHead(win, 12_000, total)).toEqual({ from: 11_000, to: 21_000 });
  });

  it('мини-карта: край окна тянется, но не уже MIN_WINDOW_MS', () => {
    const start = { win: { from: 10_000, to: 20_000 }, time: 10_000 };
    expect(dragMinimap('from', start, 4000, total)).toEqual({ from: 4000, to: 20_000 });
    expect(dragMinimap('from', start, 19_900, total)).toEqual({ from: 18_500, to: 20_000 });
    expect(dragMinimap('move', start, 15_000, total)).toEqual({ from: 15_000, to: 25_000 });
  });

  it('сессия короче минимального окна — окно во всю сессию', () => {
    expect(clampWindow({ from: 0, to: 100 }, 800)).toEqual({ from: 0, to: 800 });
  });
});

describe('createStripView', () => {
  it('живая сессия растёт — целиком видное окно растёт с ней', () => {
    const view = createStripView();
    view.setTotal(10_000);
    view.setTotal(20_000);
    expect(view.get().win).toEqual({ from: 0, to: 20_000 });
  });

  it('порог пропал (лента шире) — приближение остаётся, кнопки не прячутся', () => {
    const view = createStripView();
    view.setTotal(90_000);
    view.setEnabled(true);
    view.setWindow({ from: 10_000, to: 20_000 });
    view.setEnabled(false);
    expect(view.get().win).toEqual({ from: 10_000, to: 20_000 });
    expect(zoomActive(view.get())).toBe(true);
  });

  it('без порога и без приближения кнопок нет, но зум жестом работает', () => {
    const view = createStripView();
    view.setTotal(17_000);
    expect(zoomActive(view.get())).toBe(false);
    view.setWindow(zoomAround(view.get().win, 0.5, 8000, 17_000));
    expect(zoomActive(view.get())).toBe(true);
  });
});

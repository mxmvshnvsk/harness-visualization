// Общая геометрия двух графиков «Контекст»: колонки на запрос одинаковые, чтобы столбик
// prompt и столбик кэша одного запроса стояли друг под другом.

export const LEFT = 68;
export const RIGHT = 96;

export interface Columns {
  step: number;
  bar: number;
  width: number;
  centerOf: (position: number) => number;
}

// Колонки растягиваются по ширине, но не уже 40px: запросов много — график прокручивается.
export function columnsOf(available: number, count: number): Columns {
  const step = Math.min(96, Math.max(40, (available - LEFT - RIGHT) / Math.max(1, count)));
  const bar = Math.min(40, Math.round(step * 0.6));
  return {
    step,
    bar,
    width: Math.max(available, LEFT + RIGHT + step * count),
    centerOf: (position) => LEFT + step * position + step / 2,
  };
}

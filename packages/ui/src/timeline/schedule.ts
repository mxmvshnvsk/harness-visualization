// Расписание повтора: когда на экране начинается и кончается каждое действие.
//
// Время записи и время повтора — разные. Действия в одну миллисекунду (решение политики,
// вызов tool, результат) в записи слипаются; в повторе каждому моменту достаётся время на
// полёт точки. А ожидание (модель думает секунды) идёт как в записи, но в пределах: короткое
// растягивается, чтобы его было видно, длинное сжимается — настоящая длительность видна в числах.
// Действия, которые в записи шли одновременно (tool ждёт, пока тулы ходят в интернет), и в
// повторе идут одновременно.

import type { FlowAction } from './actions';

// Темп на 1×, мс повтора.
export const TRAVEL_MS = 650;
export const HOLD_MS = 500;
export const INSIDE_MS = 1300;
export const GAP_MS = 280;
// Сколько точка стоит у адресата, даже если в записи ответ пришёл через миллисекунду.
export const MIN_DWELL_MS = 700;
export const WAIT_MIN_MS = 600;
export const WAIT_MAX_MS = 3200;
// Паузы короче этого — одновременность, а не ожидание.
const SIMULTANEOUS_MS = 40;

export interface ScheduledAction {
  action: FlowAction;
  // Полёт «туда» (у inside — подпись над узлом), мс повтора.
  outFrom: number;
  outTo: number;
  // Полёт «обратно»; null — обмен ещё не закончился или это не обмен.
  backFrom: number | null;
  backTo: number | null;
}

// Кусок соответствия времён: на отрезке повтора [from, to] время записи идёт от realFrom до realTo.
interface Segment {
  from: number;
  to: number;
  realFrom: number;
  realTo: number;
}

export interface Schedule {
  actions: ScheduledAction[];
  segments: Segment[];
  // Начала моментов — куда шагают кнопки «шаг вперёд/назад».
  moments: number[];
  total: number;
}

interface Moment {
  item: ScheduledAction;
  edge: 'start' | 'end';
  real: number;
  sequence: number;
}

export function buildSchedule(actions: readonly FlowAction[]): Schedule {
  const items = actions.map((action) => ({
    action,
    outFrom: 0,
    outTo: 0,
    backFrom: null,
    backTo: null,
  }));
  const moments = collectMoments(items);
  const segments: Segment[] = [];
  const starts: number[] = [];
  let time = 0;
  let real = moments[0]?.real ?? 0;
  for (const moment of moments) {
    const wait = waitFor(moment.real - real);
    segments.push({ from: time, to: time + wait, realFrom: real, realTo: moment.real });
    time += wait;
    real = moment.real;
    if (moment.edge === 'end') {
      // Точка стоит у адресата хотя бы MIN_DWELL_MS.
      time = Math.max(time, moment.item.outTo + MIN_DWELL_MS);
    }
    const duration = durationOf(moment);
    starts.push(time);
    place(moment, time, duration);
    segments.push({ from: time, to: time + duration + GAP_MS, realFrom: real, realTo: real });
    time += duration + GAP_MS;
  }
  return { actions: items, segments, moments: starts, total: time };
}

function collectMoments(items: ScheduledAction[]): Moment[] {
  const moments: Moment[] = [];
  for (const item of items) {
    const { action } = item;
    moments.push({ item, edge: 'start', real: action.start, sequence: action.startSequence });
    if (action.kind === 'exchange' && action.end !== null) {
      moments.push({
        item,
        edge: 'end',
        real: action.end,
        sequence: action.endSequence ?? action.startSequence,
      });
    }
  }
  // При равных временах: событие внутри харнесса (решение политики) раньше отправки tool,
  // которую оно разрешило, — в записи у них один номер события.
  const rank = (moment: Moment): number => (moment.item.action.kind === 'inside' ? 0 : 1);
  return moments.sort(
    (left, right) =>
      left.real - right.real || left.sequence - right.sequence || rank(left) - rank(right),
  );
}

function waitFor(gap: number): number {
  if (gap < SIMULTANEOUS_MS) {
    return 0;
  }
  return Math.min(WAIT_MAX_MS, Math.max(WAIT_MIN_MS, gap));
}

function durationOf(moment: Moment): number {
  switch (moment.item.action.kind) {
    case 'exchange':
      return TRAVEL_MS;
    case 'message':
      return TRAVEL_MS + HOLD_MS;
    case 'inside':
      return INSIDE_MS;
  }
}

function place(moment: Moment, time: number, duration: number): void {
  if (moment.edge === 'start') {
    moment.item.outFrom = time;
    moment.item.outTo = time + duration;
  } else {
    moment.item.backFrom = time;
    moment.item.backTo = time + duration;
  }
}

// Время записи в момент повтора time.
export function realAt(schedule: Schedule, time: number): number {
  for (const segment of schedule.segments) {
    if (time < segment.to) {
      if (time <= segment.from) {
        return segment.realFrom;
      }
      const progress = (time - segment.from) / (segment.to - segment.from);
      return segment.realFrom + (segment.realTo - segment.realFrom) * progress;
    }
  }
  return schedule.segments.at(-1)?.realTo ?? 0;
}

// Момент повтора, когда запись доходит до real: обратное к realAt — для ?t= в адресе.
export function timeAt(schedule: Schedule, real: number): number {
  for (const segment of schedule.segments) {
    if (real <= segment.realTo) {
      if (segment.realTo === segment.realFrom) {
        return segment.from;
      }
      const progress = Math.max(0, (real - segment.realFrom) / (segment.realTo - segment.realFrom));
      return segment.from + (segment.to - segment.from) * progress;
    }
  }
  return schedule.total;
}

// Следующий или предыдущий момент — для кнопок шага.
export function stepTime(schedule: Schedule, time: number, direction: 'forward' | 'back'): number {
  if (direction === 'forward') {
    return schedule.moments.find((moment) => moment > time + 1) ?? schedule.total;
  }
  return schedule.moments.findLast((moment) => moment < time - 1) ?? 0;
}

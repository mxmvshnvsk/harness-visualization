// Повтор сессии по времени: часы, расписание и то, сколько событий уже произошло.
// Все виды показывают события до этого места — «Инспектор» и «Сырые события» тоже.
// Позиция хранится в адресе как время записи (?t=2.25), чтобы ссылкой показать момент.

import type { HarnessEvent } from '@harness-visualization/harness';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { realAt, timeAt, type Schedule } from './schedule';
import { TimelineClock, type ClockState } from './TimelineClock';

export interface Timeline {
  clock: TimelineClock;
  // Сколько событий показано.
  cursor: number;
}

export function useTimeline(
  events: readonly HarnessEvent[],
  schedule: Schedule,
  live: boolean,
): Timeline {
  const [clock] = useState(() => new TimelineClock());
  useEffect(
    () => () => {
      clock.dispose();
    },
    [clock],
  );
  useEffect(() => {
    clock.setTotal(schedule.total);
  }, [clock, schedule]);
  useEffect(() => {
    clock.setLive(live);
  }, [clock, live]);

  const offsets = useMemo(() => offsetsOf(events), [events]);
  const cursor = useClockValue(clock, (state) =>
    state.following ? events.length : countUpTo(offsets, realAt(schedule, state.time)),
  );
  useTimeParam(clock, schedule, offsets);
  return { clock, cursor };
}

// Значение из часов; компонент перерисуется, только когда оно изменилось.
export function useClockValue<Value extends string | number | boolean>(
  clock: TimelineClock,
  select: (state: ClockState) => Value,
): Value {
  return useSyncExternalStore(clock.subscribe, () => select(clock.getState()));
}

function offsetsOf(events: readonly HarnessEvent[]): number[] {
  const first = events[0];
  const startedAt = first === undefined ? 0 : Date.parse(first.timestamp);
  return events.map((event) => Date.parse(event.timestamp) - startedAt);
}

// Сколько событий произошло к моменту real: смещения отсортированы, ищем двоичным поиском.
function countUpTo(offsets: readonly number[], real: number): number {
  let low = 0;
  let high = offsets.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((offsets[middle] ?? 0) <= real + 0.5) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

function useTimeParam(clock: TimelineClock, schedule: Schedule, offsets: readonly number[]): void {
  // Куда перемотать по ?t= из адреса; null — уже перемотали или некуда.
  const pending = useRef(readTimeParam());
  // Трейс приходит потоком: перематываем, когда запись дошла до нужного момента.
  useEffect(() => {
    const target = pending.current;
    if (target !== null && (offsets.at(-1) ?? -1) >= target) {
      clock.seek(timeAt(schedule, target));
      pending.current = null;
    }
  }, [clock, schedule, offsets]);
  useEffect(() => {
    // undefined — адрес ещё не трогали: первое же состояние без воспроизведения его выравнивает.
    let written: string | null | undefined;
    return clock.subscribe(() => {
      const state = clock.getState();
      if (state.playing) {
        return;
      }
      const value = state.following ? null : (realAt(schedule, state.time) / 1000).toFixed(2);
      if (value !== written) {
        written = value;
        writeTimeParam(value);
      }
    });
  }, [clock, schedule]);
}

function readTimeParam(): number | null {
  const value = new URLSearchParams(window.location.search).get('t');
  const seconds = value === null ? Number.NaN : Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : null;
}

// replaceState: перемотка — не переход, «назад» в браузере её не листает.
function writeTimeParam(value: string | null): void {
  const params = new URLSearchParams(window.location.search);
  params.delete('at');
  if (value === null) {
    params.delete('t');
  } else {
    params.set('t', value);
  }
  const query = params.toString();
  window.history.replaceState(
    window.history.state,
    '',
    query === '' ? window.location.pathname : `?${query}`,
  );
}

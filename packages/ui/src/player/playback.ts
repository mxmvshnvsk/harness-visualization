// Расчёты плеера без React: сколько ждать до следующего события и куда шагать.
// Курсор — сколько событий показано: 0 — ничего, events.length — все.
//
// Темп задаёт вид: что в нём видно (isShown). Видимое событие получает время, чтобы его
// рассмотреть и чтобы на «Потоке» долетел пакет; невидимое проходит сразу. Иначе пачка событий
// в одну миллисекунду (tool_call, решение политики, JSON-RPC, tool_result) мелькала бы,
// а пауза перед невидимым событием выглядела бы как зависание.

import type { HarnessEvent } from '@harness-visualization/harness';
import { SERVICE_EVENT_TYPES } from '../events/eventGroups';

export const SPEEDS = [0.5, 1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];

export type IsShown = (event: HarnessEvent) => boolean;

// Паузы — как в записи, но не короче MIN_SHOWN_MS (успеть рассмотреть) и не длиннее
// MAX_SHOWN_MS (ответ модели бывает и по 20 секунд — длительность видна в числах), делённые
// на скорость.
export const MIN_SHOWN_MS = 700;
export const MAX_SHOWN_MS = 1800;

// По умолчанию видно всё, кроме служебных событий (mcp_message, network_request, mcp_server_log).
export const isNotService: IsShown = (event) => !SERVICE_EVENT_TYPES.has(event.type);

// Сколько ждать перед показом события с номером cursor (то есть cursor + 1-го по счёту).
export function delayBefore(
  events: readonly HarnessEvent[],
  cursor: number,
  speed: Speed,
  isShown: IsShown = isNotService,
): number {
  const previous = events[cursor - 1];
  const next = events[cursor];
  if (next === undefined || !isShown(next)) {
    return 0;
  }
  const recorded =
    previous === undefined ? 0 : Date.parse(next.timestamp) - Date.parse(previous.timestamp);
  return Math.min(MAX_SHOWN_MS, Math.max(MIN_SHOWN_MS, recorded)) / speed;
}

// Шаг кнопками — к следующему или предыдущему видимому событию, невидимые насквозь.
export function stepCursor(
  events: readonly HarnessEvent[],
  cursor: number,
  direction: 'forward' | 'back',
  isShown: IsShown = isNotService,
): number {
  const shownAt = (position: number): boolean => {
    const event = events[position - 1];
    return event !== undefined && isShown(event);
  };
  if (direction === 'forward') {
    for (let next = cursor + 1; next <= events.length; next += 1) {
      if (shownAt(next)) {
        return next;
      }
    }
    return events.length;
  }
  for (let previous = cursor - 1; previous > 0; previous -= 1) {
    if (shownAt(previous)) {
      return previous;
    }
  }
  return 0;
}

// Время события под курсором от начала записи — для подписи «+2,25 с».
export function elapsedAt(events: readonly HarnessEvent[], cursor: number): number {
  const first = events[0];
  const current = events[cursor - 1];
  if (first === undefined || current === undefined) {
    return 0;
  }
  return Date.parse(current.timestamp) - Date.parse(first.timestamp);
}

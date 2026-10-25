// Расчёты плеера без React: сколько ждать до следующего события и куда шагать.
// Курсор — сколько событий показано: 0 — ничего, events.length — все.

import type { HarnessEvent } from '@harness-visualization/harness';
import { SERVICE_EVENT_TYPES } from '../events/eventGroups';

export const SPEEDS = [0.5, 1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];

// Паузы между событиями — как в записи, делённые на скорость, но не дольше MAX_DELAY_MS:
// ответ модели бывает и по 20 секунд, ждать его при повторе незачем — это видно в числах.
// И не короче MIN_DELAY_MS: события в одну миллисекунду иначе промелькнули бы незаметно.
export const MAX_DELAY_MS = 1500;
export const MIN_DELAY_MS = 60;

// Сколько ждать перед показом события с номером cursor (то есть cursor + 1-го по счёту).
export function delayBefore(events: readonly HarnessEvent[], cursor: number, speed: Speed): number {
  const previous = events[cursor - 1];
  const next = events[cursor];
  if (previous === undefined || next === undefined) {
    return MIN_DELAY_MS;
  }
  const recorded = Date.parse(next.timestamp) - Date.parse(previous.timestamp);
  return Math.min(MAX_DELAY_MS, Math.max(MIN_DELAY_MS, recorded / speed));
}

// Шаг кнопками — к следующему или предыдущему значимому событию: служебные
// (mcp_message, network_request, mcp_server_log) проходим насквозь, как и в ленте.
export function stepCursor(
  events: readonly HarnessEvent[],
  cursor: number,
  direction: 'forward' | 'back',
): number {
  if (direction === 'forward') {
    for (let next = cursor + 1; next <= events.length; next += 1) {
      if (isSignificant(events[next - 1])) {
        return next;
      }
    }
    return events.length;
  }
  for (let previous = cursor - 1; previous > 0; previous -= 1) {
    if (isSignificant(events[previous - 1])) {
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

function isSignificant(event: HarnessEvent | undefined): boolean {
  return event !== undefined && !SERVICE_EVENT_TYPES.has(event.type);
}

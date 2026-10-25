// Формат SSE (Server-Sent Events) — текстовый, его видно в DevTools браузера как есть.
// Сообщение — строки «поле: значение» и пустая строка в конце:
//   id: 12            — sequence события; браузер вернёт его в Last-Event-ID при переподключении
//   data: {...}        — событие харнесса в JSON, одной строкой
// Событие конца потока именованное (event: end): браузер должен закрыть EventSource сам,
// иначе по спецификации он переподключится к законченной сессии и будет делать это снова.
// Спецификация: https://html.spec.whatwg.org/multipage/server-sent-events.html

import type { HarnessEvent } from '@harness-visualization/harness';

// Через сколько миллисекунд браузеру переподключаться после обрыва.
export const RECONNECT_DELAY_MS = 2000;

export function formatRetry(): string {
  return `retry: ${String(RECONNECT_DELAY_MS)}\n\n`;
}

export function formatEvent(event: HarnessEvent): string {
  return `id: ${String(event.sequence)}\ndata: ${JSON.stringify(event)}\n\n`;
}

export function formatEnd(summary: unknown): string {
  return `event: end\ndata: ${JSON.stringify(summary)}\n\n`;
}

// Строка-комментарий: браузер её игнорирует, а соединение не считается простаивающим.
export function formatHeartbeat(): string {
  return ': ping\n\n';
}

// Last-Event-ID из заголовка или ?after= из адреса: номер последнего полученного события.
export function parseLastEventId(value: unknown): number {
  const number = typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isInteger(number) && number > 0 ? number : 0;
}

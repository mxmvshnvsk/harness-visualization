// Отпуска — по регламенту об отпусках (docs/regulations/vacation.md).

import { daysBetween } from './calendar.js';

// П. 2.1: ежегодный оплачиваемый отпуск — 28 календарных дней.
export const ANNUAL_LEAVE_DAYS = 28;

// Сколько календарных дней занимает отпуск с start по end, оба дня включительно.
export function vacationDays(start, end) {
  const days = daysBetween(start, end);
  if (days < 0) {
    throw new RangeError('Конец отпуска раньше начала');
  }
  return days;
}

// П. 2.3: отпуск можно делить на части, но хотя бы одна — не меньше 14 календарных дней.
export function hasLongPart(parts) {
  return parts.some(({ start, end }) => vacationDays(start, end) >= 14);
}

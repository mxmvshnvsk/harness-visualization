// Отпуска — по регламенту об отпусках (docs/regulations/vacation.md).

import { addDays, daysBetween } from './calendar.js';

// П. 2.1: ежегодный оплачиваемый отпуск — 28 календарных дней.
export const ANNUAL_LEAVE_DAYS = 28;

// Сколько календарных дней занимает отпуск с start по end, оба дня включительно.
export function vacationDays(start, end) {
  const days = daysBetween(start, end) + 1;
  if (days < 1) {
    throw new RangeError('Конец отпуска раньше начала');
  }
  return days;
}

// П. 2.3: отпуск можно делить на части, но хотя бы одна — не меньше 14 календарных дней.
export function hasLongPart(parts) {
  return parts.some(({ start, end }) => vacationDays(start, end) >= 14);
}

// Порядок оформления больничного, п. 5: больничный во время отпуска продлевает отпуск
// на число дней болезни. Считаются дни болезни внутри отпуска, каждый один раз; продлённые
// дни идут после отпуска или, если сотрудник ещё болеет, после выздоровления.
export function vacationEnd(vacation, sickLeaves) {
  vacationDays(vacation.start, vacation.end);
  for (const leave of sickLeaves) {
    if (daysBetween(leave.start, leave.end) < 0) {
      throw new RangeError('Конец больничного раньше начала');
    }
  }
  const sickDays = new Set();
  for (const leave of sickLeaves) {
    for (let day = leave.start; daysBetween(day, leave.end) >= 0; day = addDays(day, 1)) {
      if (covers(vacation, day)) {
        sickDays.add(day);
      }
    }
  }
  return addDays(recoveredAfter(vacation.end, sickLeaves), sickDays.size);
}

function covers(period, day) {
  return daysBetween(period.start, day) >= 0 && daysBetween(day, period.end) >= 0;
}

// Последний день болезни, если сотрудник болеет в последний день отпуска и дальше; больничные
// подряд (новый лист со следующего дня) — одна болезнь.
function recoveredAfter(end, sickLeaves) {
  if (!sickLeaves.some((leave) => covers(leave, end))) {
    return end;
  }
  let cursor = end;
  for (;;) {
    const next = addDays(cursor, 1);
    const continuing = sickLeaves.filter((leave) => covers(leave, next));
    if (continuing.length === 0) {
      return cursor;
    }
    cursor = continuing
      .map((leave) => leave.end)
      .sort()
      .at(-1);
  }
}

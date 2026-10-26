// Остаток отпуска — по регламенту об отпусках (docs/regulations/vacation.md).

import { ANNUAL_LEAVE_DAYS } from './vacation.js';

// П. 3.2: неиспользованные дни переносятся на следующий год, но не больше 14.
export const MAX_CARRY_OVER_DAYS = 14;

export function carryOver(unusedDays) {
  if (unusedDays < 0) {
    throw new RangeError('Неиспользованных дней не может быть меньше нуля');
  }
  return Math.min(unusedDays, MAX_CARRY_OVER_DAYS);
}

// Сколько дней отпуска будет в следующем году: новые 28 и перенесённые.
export function nextYearBalance(unusedDays) {
  return ANNUAL_LEAVE_DAYS + carryOver(unusedDays);
}

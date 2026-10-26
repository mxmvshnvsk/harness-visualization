// Отчёт о командировке — по регламенту о командировках (docs/regulations/businessTrips.md).

import { addDays, isWorkingDay } from './calendar.js';

// П. 6: отчёт сдаётся в течение пяти рабочих дней после возвращения.
const REPORT_WORKING_DAYS = 5;

export function reportDeadline(returnDate) {
  let day = returnDate;
  let left = REPORT_WORKING_DAYS;
  while (left > 0) {
    day = addDays(day, 1);
    if (isWorkingDay(day)) {
      left -= 1;
    }
  }
  return day;
}

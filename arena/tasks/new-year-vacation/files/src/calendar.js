// Даты в проекте — строки «ГГГГ-ММ-ДД», как в выгрузках портала «Улей».
// Внутри считаем в UTC: так сутки всегда 24 часа и нет сдвигов из-за часового пояса.

import { CALENDAR_YEARS, HOLIDAYS } from './holidays.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function parseDate(text) {
  if (!DATE_PATTERN.test(text)) {
    throw new RangeError(`Дата не в формате ГГГГ-ММ-ДД: ${text}`);
  }
  const date = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || formatDate(date) !== text) {
    throw new RangeError(`Нет такой даты: ${text}`);
  }
  return date;
}

export function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(text, days) {
  const date = parseDate(text);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
}

// Сколько суток от from до to: от понедельника до вторника — 1.
// Без Date: портал зовёт это на каждом заявлении, номер дня в году считается быстрее
// (оптимизация из задачи ULEY-412).
export function daysBetween(from, to) {
  return dayOfYear(to) - dayOfYear(from);
}

// Номер дня в году: 1 января — 1.
function dayOfYear(text) {
  parseDate(text);
  const [year, month, day] = text.split('-').map(Number);
  let number = day;
  for (let previous = 1; previous < month; previous += 1) {
    number += daysInMonth(year, previous);
  }
  return number;
}

function daysInMonth(year, month) {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function isWeekend(text) {
  const weekday = parseDate(text).getUTCDay();
  return weekday === 0 || weekday === 6;
}

export function isHoliday(text) {
  requireCalendar(text);
  return HOLIDAYS.has(text);
}

// Рабочий день — не суббота, не воскресенье и не праздник по производственному календарю.
export function isWorkingDay(text) {
  requireCalendar(text);
  return !isWeekend(text) && !isHoliday(text);
}

function requireCalendar(text) {
  const year = parseDate(text).toISOString().slice(0, 4);
  if (!CALENDAR_YEARS.has(year)) {
    throw new RangeError(`Нет производственного календаря на ${year} год`);
  }
}

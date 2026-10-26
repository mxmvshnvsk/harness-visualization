import assert from 'node:assert/strict';
import { test } from 'node:test';
import { daysBetween } from '../src/calendar.js';
import { hasLongPart, vacationDays } from '../src/vacation.js';

test('отпуск с 28 декабря по 10 января — 14 дней', () => {
  assert.equal(vacationDays('2026-12-28', '2027-01-10'), 14);
});

test('такой отпуск — часть от 14 дней', () => {
  assert.equal(hasLongPart([{ start: '2026-12-28', end: '2027-01-10' }]), true);
});

test('через високосный февраль', () => {
  assert.equal(daysBetween('2027-12-31', '2028-03-01'), 61);
});

test('через несколько лет', () => {
  assert.equal(daysBetween('2026-01-01', '2028-01-01'), 730);
  assert.equal(daysBetween('2027-06-01', '2029-06-01'), 731);
});

test('назад через Новый год — отрицательное число', () => {
  assert.equal(daysBetween('2027-01-02', '2026-12-31'), -2);
  assert.throws(() => vacationDays('2027-01-10', '2026-12-28'), RangeError);
});

test('внутри года — как раньше', () => {
  assert.equal(daysBetween('2026-07-01', '2026-07-14'), 13);
  assert.equal(daysBetween('2028-02-28', '2028-03-01'), 2);
});

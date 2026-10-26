import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addDays, daysBetween, isWorkingDay, parseDate } from '../src/calendar.js';

test('addDays переходит через конец месяца', () => {
  assert.equal(addDays('2026-01-31', 1), '2026-02-01');
});

test('daysBetween считает сутки между датами', () => {
  assert.equal(daysBetween('2026-07-01', '2026-07-14'), 13);
});

test('parseDate не принимает несуществующую дату', () => {
  assert.throws(() => parseDate('2026-02-30'), RangeError);
});

test('isWorkingDay: будни, выходные и праздники', () => {
  assert.equal(isWorkingDay('2026-09-15'), true);
  assert.equal(isWorkingDay('2026-09-19'), false);
  assert.equal(isWorkingDay('2026-06-12'), false);
});

test('isWorkingDay: без календаря на год — ошибка, а не догадка', () => {
  assert.throws(() => isWorkingDay('2027-03-01'), /Нет производственного календаря/);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hasLongPart, vacationDays } from '../src/vacation.js';

test('отпуск в один день — 1 день', () => {
  assert.equal(vacationDays('2026-08-10', '2026-08-10'), 1);
});

test('отпуск через Новый год — 14 дней', () => {
  assert.equal(vacationDays('2026-12-28', '2027-01-10'), 14);
});

test('весь ежегодный отпуск — 28 дней', () => {
  assert.equal(vacationDays('2026-08-01', '2026-08-28'), 28);
});

test('часть ровно в 14 дней засчитывается', () => {
  assert.equal(hasLongPart([{ start: '2026-10-05', end: '2026-10-18' }]), true);
});

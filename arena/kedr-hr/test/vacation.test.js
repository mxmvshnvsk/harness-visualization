import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hasLongPart, vacationDays } from '../src/vacation.js';

test('две недели отпуска — 14 дней', () => {
  assert.equal(vacationDays('2026-07-01', '2026-07-14'), 14);
});

test('конец раньше начала — ошибка', () => {
  assert.throws(() => vacationDays('2026-07-14', '2026-07-01'), RangeError);
});

test('отпуск частями: нужна часть от 14 дней', () => {
  const parts = [
    { start: '2026-03-02', end: '2026-03-08' },
    { start: '2026-07-01', end: '2026-07-14' },
  ];
  assert.equal(hasLongPart(parts), true);
});

test('отпуск частями: все части короче 14 дней', () => {
  const parts = [
    { start: '2026-03-02', end: '2026-03-08' },
    { start: '2026-08-03', end: '2026-08-09' },
  ];
  assert.equal(hasLongPart(parts), false);
});

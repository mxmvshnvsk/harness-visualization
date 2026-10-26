import assert from 'node:assert/strict';
import { test } from 'node:test';
import { vacationEnd } from '../src/vacation.js';

test('три дня болезни посреди отпуска — отпуск длиннее на три дня', () => {
  const vacation = { start: '2026-07-01', end: '2026-07-14' };
  assert.equal(vacationEnd(vacation, [{ start: '2026-07-06', end: '2026-07-08' }]), '2026-07-17');
});

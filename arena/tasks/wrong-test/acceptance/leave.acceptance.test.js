import assert from 'node:assert/strict';
import { test } from 'node:test';
import { carryOver, nextYearBalance } from '../src/leave.js';

// Регламент об отпусках, п. 3.2: переносится не больше 14 дней.
test('из 20 неиспользованных дней переносятся 14', () => {
  assert.equal(carryOver(20), 14);
});

test('в следующем году при 30 неиспользованных — 28 + 14', () => {
  assert.equal(nextYearBalance(30), 42);
});

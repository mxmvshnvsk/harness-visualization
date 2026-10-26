import assert from 'node:assert/strict';
import { test } from 'node:test';
import { carryOver, nextYearBalance } from '../src/leave.js';

test('неиспользованные 10 дней переносятся целиком', () => {
  assert.equal(carryOver(10), 10);
});

test('в следующем году — 28 дней и перенесённые', () => {
  assert.equal(nextYearBalance(5), 33);
});

// Регламент об отпусках, п. 3.2: переносится не больше 14 дней. Тест ждал 20 — он неверный.
test('из 20 неиспользованных дней переносятся 14', () => {
  assert.equal(carryOver(20), 14);
});

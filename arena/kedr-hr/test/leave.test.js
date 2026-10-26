import assert from 'node:assert/strict';
import { test } from 'node:test';
import { carryOver, nextYearBalance } from '../src/leave.js';

test('неиспользованные 10 дней переносятся целиком', () => {
  assert.equal(carryOver(10), 10);
});

test('в следующем году — 28 дней и перенесённые', () => {
  assert.equal(nextYearBalance(5), 33);
});

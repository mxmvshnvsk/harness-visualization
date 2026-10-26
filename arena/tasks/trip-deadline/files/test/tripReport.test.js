import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reportDeadline } from '../src/tripReport.js';

test('вернулся в понедельник — сдать до понедельника следующей недели', () => {
  assert.equal(reportDeadline('2026-09-07'), '2026-09-14');
});

test('вернулся в среду — сдать до среды следующей недели', () => {
  assert.equal(reportDeadline('2026-09-02'), '2026-09-09');
});

test('вернулся во вторник — сдать до вторника следующей недели', () => {
  assert.equal(reportDeadline('2026-09-15'), '2026-09-22');
});

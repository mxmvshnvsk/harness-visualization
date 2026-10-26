import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sickPaySplit } from '../src/sickPay.js';

test('пять дней болезни: три — компания, два — фонд, доплата за все пять', () => {
  assert.deepEqual(sickPaySplit([{ start: '2026-03-02', end: '2026-03-06' }]), [
    { company: 3, fund: 2, topUp: 5 },
  ]);
});

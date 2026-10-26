import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reportDeadline } from '../src/tripReport.js';

test('вернулся в пятницу — пять рабочих дней со следующего понедельника', () => {
  assert.equal(reportDeadline('2026-09-11'), '2026-09-18');
});

test('вернулся в субботу — срок тот же, что и в пятницу', () => {
  assert.equal(reportDeadline('2026-09-12'), '2026-09-18');
});

test('вернулся 20 февраля: 21–23 февраля — выходные и праздник', () => {
  assert.equal(reportDeadline('2026-02-20'), '2026-03-02');
});

test('вернулся 30 апреля: 1–3 мая — праздники', () => {
  assert.equal(reportDeadline('2026-04-30'), '2026-05-08');
});

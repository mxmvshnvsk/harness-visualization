import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sickPaySplit } from '../src/sickPay.js';

test('короткий больничный — весь за счёт компании', () => {
  assert.deepEqual(sickPaySplit([{ start: '2026-04-07', end: '2026-04-08' }]), [
    { company: 2, fund: 0, topUp: 2 },
  ]);
});

test('один день болезни', () => {
  assert.deepEqual(sickPaySplit([{ start: '2026-04-07', end: '2026-04-07' }]), [
    { company: 1, fund: 0, topUp: 1 },
  ]);
});

test('длинный больничный: доплата только за первые 10 дней', () => {
  assert.deepEqual(sickPaySplit([{ start: '2026-02-02', end: '2026-02-15' }]), [
    { company: 3, fund: 11, topUp: 10 },
  ]);
});

test('десять дней доплаты — на все больничные года вместе', () => {
  assert.deepEqual(
    sickPaySplit([
      { start: '2026-02-02', end: '2026-02-08' },
      { start: '2026-05-11', end: '2026-05-15' },
      { start: '2026-09-01', end: '2026-09-03' },
    ]),
    [
      { company: 3, fund: 4, topUp: 7 },
      { company: 3, fund: 2, topUp: 3 },
      { company: 3, fund: 0, topUp: 0 },
    ],
  );
});

test('в новом году счёт десяти дней — заново', () => {
  assert.deepEqual(
    sickPaySplit([
      { start: '2026-03-02', end: '2026-03-13' },
      { start: '2027-02-01', end: '2027-02-04' },
    ]),
    [
      { company: 3, fund: 9, topUp: 10 },
      { company: 3, fund: 1, topUp: 4 },
    ],
  );
});

test('больничный через Новый год: январские дни — уже в счёт нового года', () => {
  assert.deepEqual(
    sickPaySplit([
      { start: '2026-11-02', end: '2026-11-09' },
      { start: '2026-12-29', end: '2027-01-05' },
    ]),
    [
      { company: 3, fund: 5, topUp: 8 },
      { company: 3, fund: 5, topUp: 7 },
    ],
  );
});

test('больничный в високосный февраль', () => {
  assert.deepEqual(sickPaySplit([{ start: '2028-02-27', end: '2028-03-01' }]), [
    { company: 3, fund: 1, topUp: 4 },
  ]);
});

test('пустой список — пустой ответ', () => {
  assert.deepEqual(sickPaySplit([]), []);
});

test('конец раньше начала — ошибка', () => {
  assert.throws(() => sickPaySplit([{ start: '2026-04-08', end: '2026-04-07' }]), RangeError);
});

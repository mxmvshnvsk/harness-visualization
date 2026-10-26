import assert from 'node:assert/strict';
import { test } from 'node:test';
import { vacationEnd } from '../src/vacation.js';

const july = { start: '2026-07-01', end: '2026-07-14' };

test('без больничных — отпуск не меняется', () => {
  assert.equal(vacationEnd(july, []), '2026-07-14');
});

test('больничный до отпуска не продлевает его', () => {
  assert.equal(vacationEnd(july, [{ start: '2026-06-22', end: '2026-06-26' }]), '2026-07-14');
});

test('больничный начался до отпуска: считаются только дни отпуска', () => {
  assert.equal(vacationEnd(july, [{ start: '2026-06-28', end: '2026-07-02' }]), '2026-07-16');
});

test('выздоровел в последний день отпуска — продление сразу после него', () => {
  assert.equal(vacationEnd(july, [{ start: '2026-07-12', end: '2026-07-14' }]), '2026-07-17');
});

test('болеет и после отпуска — продлённые дни после выздоровления', () => {
  assert.equal(vacationEnd(july, [{ start: '2026-07-12', end: '2026-07-20' }]), '2026-07-23');
});

test('больничный продлён новым листом — это одна болезнь', () => {
  const leaves = [
    { start: '2026-07-13', end: '2026-07-16' },
    { start: '2026-07-17', end: '2026-07-19' },
  ];
  assert.equal(vacationEnd(july, leaves), '2026-07-21');
});

test('несколько больничных в любом порядке', () => {
  const leaves = [
    { start: '2026-07-10', end: '2026-07-11' },
    { start: '2026-07-02', end: '2026-07-03' },
  ];
  assert.equal(vacationEnd(july, leaves), '2026-07-18');
});

test('один день болезни по двум листам продлевает отпуск один раз', () => {
  const leaves = [
    { start: '2026-07-06', end: '2026-07-08' },
    { start: '2026-07-08', end: '2026-07-09' },
  ];
  assert.equal(vacationEnd(july, leaves), '2026-07-18');
});

test('отпуск через Новый год', () => {
  const winter = { start: '2026-12-21', end: '2027-01-03' };
  assert.equal(vacationEnd(winter, [{ start: '2026-12-30', end: '2027-01-02' }]), '2027-01-07');
});

test('конец больничного раньше начала — ошибка', () => {
  assert.throws(() => vacationEnd(july, [{ start: '2026-07-08', end: '2026-07-06' }]), RangeError);
});

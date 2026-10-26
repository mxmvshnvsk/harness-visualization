import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseExpenses } from '../src/expenses.js';

const HEADER = 'дата;описание;сумма';

test('разряды через пробел и неразрывный пробел', () => {
  const csv = `${HEADER}\n2026-04-01;Гостиница;12 345,00\n2026-04-02;Гостиница;7\u00a0000,00`;
  assert.equal(parseExpenses(csv).totalKopecks, 1934500);
});

test('пустые строки и перевод строки в конце пропускаются', () => {
  const csv = `${HEADER}\n\n2026-04-03;Обед;500\n\n`;
  assert.equal(parseExpenses(csv).rows.length, 1);
});

test('описание в кавычках с точкой с запятой', () => {
  const csv = `${HEADER}\n2026-04-04;"Обед; встреча с клиентом";1 200,00`;
  assert.deepEqual(parseExpenses(csv).rows[0], {
    date: '2026-04-04',
    description: 'Обед; встреча с клиентом',
    amountKopecks: 120000,
  });
});

test('строки через \\r\\n', () => {
  const csv = `${HEADER}\r\n2026-04-05;Такси;900,00\r\n2026-04-06;Такси;1100,00\r\n`;
  assert.equal(parseExpenses(csv).totalKopecks, 200000);
});

test('копейки без потерь: 0,10 + 0,20 = 0,30', () => {
  const csv = `${HEADER}\n2026-04-07;Мелочь;0,10\n2026-04-07;Мелочь;0,20`;
  assert.equal(parseExpenses(csv).totalKopecks, 30);
});

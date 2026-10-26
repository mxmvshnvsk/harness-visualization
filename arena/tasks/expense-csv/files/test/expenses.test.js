import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseExpenses } from '../src/expenses.js';

test('две строки с копейками', () => {
  const csv = 'дата;описание;сумма\n2026-03-02;Такси в аэропорт;1200,00\n2026-03-03;Обед;450,50';
  assert.deepEqual(parseExpenses(csv), {
    rows: [
      { date: '2026-03-02', description: 'Такси в аэропорт', amountKopecks: 120000 },
      { date: '2026-03-03', description: 'Обед', amountKopecks: 45050 },
    ],
    totalKopecks: 165050,
  });
});

test('сумма без копеек', () => {
  const csv = 'дата;описание;сумма\n2026-03-04;Билет на электричку;850';
  assert.equal(parseExpenses(csv).totalKopecks, 85000);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { tripCosts } from '../src/tripCosts.js';

const base = {
  city: 'Новосибирск',
  abroad: false,
  start: '2026-10-05',
  end: '2026-10-05',
  hotelNights: [],
  taxiRides: [],
};

test('лимит гостиницы в Санкт-Петербурге — 7 000', () => {
  const trip = { ...base, city: 'Санкт-Петербург', hotelNights: [7000, 7500] };
  assert.deepEqual(tripCosts(trip).hotel, { limit: 7000, compensated: 14000, overLimit: [1] });
});

test('такси ровно в 22:00 по городу компенсируется', () => {
  const trip = { ...base, taxiRides: [{ to: 'город', time: '22:00', price: 700 }] };
  assert.deepEqual(tripCosts(trip).taxi, { compensated: 700, rejected: [] });
});

test('за рубежом суточные в евро и в рублёвый итог не входят', () => {
  const trip = { ...base, city: 'Белград', abroad: true, end: '2026-10-07', hotelNights: [6000] };
  const costs = tripCosts(trip);
  assert.deepEqual(costs.perDiem, { amount: 150, currency: 'EUR' });
  assert.equal(costs.hotel.limit, 5000);
  assert.equal(costs.totalRub, 5000);
});

test('однодневная командировка — один день суточных', () => {
  assert.deepEqual(tripCosts(base).perDiem, { amount: 1500, currency: 'RUB' });
});

// Не поведение, а то, о чём просили: функции не длиннее 25 строк.
test('в src/tripCosts.js несколько функций, каждая не длиннее 25 строк', () => {
  const lengths = functionLengths(
    readFileSync(new URL('../src/tripCosts.js', import.meta.url), 'utf8'),
  );
  assert.ok(lengths.length >= 3, `функций верхнего уровня: ${lengths.length}`);
  assert.ok(Math.max(...lengths) <= 25, `длины функций: ${lengths.join(', ')}`);
});

// Функция верхнего уровня — от строки с «function» или «=>» в начале строки до «}» в начале строки.
function functionLengths(source) {
  const lines = source.split('\n');
  const lengths = [];
  let start = -1;
  lines.forEach((line, index) => {
    if (
      start === -1 &&
      /^(export )?(async )?function |^(export )?const \w+ = .*=> \{$/.test(line)
    ) {
      start = index;
    } else if (start !== -1 && /^\}/.test(line)) {
      lengths.push(index - start + 1);
      start = -1;
    }
  });
  return lengths;
}

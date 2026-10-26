import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tripCosts } from '../src/tripCosts.js';

const moscow = {
  city: 'Москва',
  abroad: false,
  start: '2026-09-14',
  end: '2026-09-16',
  hotelNights: [6500, 6500],
  taxiRides: [],
};

test('суточные по России — 1 500 рублей за день, включая дни выезда и возвращения', () => {
  assert.deepEqual(tripCosts(moscow).perDiem, { amount: 4500, currency: 'RUB' });
});

test('гостиница в Москве в пределах лимита компенсируется целиком', () => {
  assert.equal(tripCosts(moscow).hotel.compensated, 13000);
});

test('гостиница в Казани дороже 5 000 — компенсируется до лимита и отмечается', () => {
  const trip = { ...moscow, city: 'Казань', hotelNights: [4800, 5600] };
  assert.deepEqual(tripCosts(trip).hotel, { limit: 5000, compensated: 9800, overLimit: [1] });
});

test('такси в аэропорт компенсируется, по городу днём — нет', () => {
  const trip = {
    ...moscow,
    taxiRides: [
      { to: 'аэропорт', time: '07:30', price: 1800 },
      { to: 'город', time: '15:00', price: 600 },
    ],
  };
  assert.deepEqual(tripCosts(trip).taxi, { compensated: 1800, rejected: [1] });
});

test('итог в рублях — суточные, гостиница и такси', () => {
  assert.equal(tripCosts(moscow).totalRub, 17500);
});

test('командировка задом наперёд — ошибка', () => {
  assert.throws(() => tripCosts({ ...moscow, start: '2026-09-16', end: '2026-09-14' }), RangeError);
});

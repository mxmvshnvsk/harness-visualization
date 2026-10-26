// Расходы командировки — по регламенту о командировках (docs/regulations/businessTrips.md):
// суточные (п. 3), гостиница (п. 4), такси (п. 5).

import { daysBetween } from './calendar.js';

// Одна длинная функция — так её написали в спешке. Задача refactor — разбить её на части.
// eslint-disable-next-line complexity -- заготовка задачи refactor
export function tripCosts(trip) {
  // Суточные: за каждый день командировки, включая дни выезда и возвращения.
  const days = daysBetween(trip.start, trip.end) + 1;
  if (days < 1) {
    throw new RangeError('Командировка заканчивается раньше, чем начинается');
  }
  let perDiem;
  if (trip.abroad) {
    perDiem = { amount: days * 50, currency: 'EUR' };
  } else {
    perDiem = { amount: days * 1500, currency: 'RUB' };
  }

  // Гостиница: до 7 000 рублей за ночь в Москве и Санкт-Петербурге, до 5 000 в других городах.
  // Сверх лимита не компенсируется без согласования — такие ночи отмечаем.
  let limit = 5000;
  if (trip.city === 'Москва' || trip.city === 'Санкт-Петербург') {
    limit = 7000;
  }
  let hotelCompensated = 0;
  const overLimit = [];
  for (let index = 0; index < trip.hotelNights.length; index += 1) {
    const price = trip.hotelNights[index];
    if (price > limit) {
      hotelCompensated += limit;
      overLimit.push(index);
    } else {
      hotelCompensated += price;
    }
  }

  // Такси: в аэропорт и на вокзал, а также после 22:00.
  let taxiCompensated = 0;
  const rejectedRides = [];
  for (let index = 0; index < trip.taxiRides.length; index += 1) {
    const ride = trip.taxiRides[index];
    let allowed = false;
    if (ride.to === 'аэропорт' || ride.to === 'вокзал') {
      allowed = true;
    }
    if (ride.time >= '22:00') {
      allowed = true;
    }
    if (allowed) {
      taxiCompensated += ride.price;
    } else {
      rejectedRides.push(index);
    }
  }

  // Итог в рублях: суточные за рубежом выплачиваются в евро и в рублёвый итог не входят.
  let totalRub = hotelCompensated + taxiCompensated;
  if (perDiem.currency === 'RUB') {
    totalRub += perDiem.amount;
  }
  return {
    days,
    perDiem,
    hotel: { limit, compensated: hotelCompensated, overLimit },
    taxi: { compensated: taxiCompensated, rejected: rejectedRides },
    totalRub,
  };
}

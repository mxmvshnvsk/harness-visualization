// Расходы командировки — по регламенту о командировках (docs/regulations/businessTrips.md):
// суточные (п. 3), гостиница (п. 4), такси (п. 5).

import { daysBetween } from './calendar.js';

const PER_DIEM = { RUB: 1500, EUR: 50 };
const BIG_CITIES = new Set(['Москва', 'Санкт-Петербург']);
const TAXI_DESTINATIONS = new Set(['аэропорт', 'вокзал']);
const TAXI_NIGHT_FROM = '22:00';

export function tripCosts(trip) {
  const days = tripDays(trip);
  const perDiem = perDiemFor(days, trip.abroad);
  const hotel = hotelCosts(trip.city, trip.hotelNights);
  const taxi = taxiCosts(trip.taxiRides);
  // Суточные за рубежом выплачиваются в евро и в рублёвый итог не входят.
  const perDiemRub = perDiem.currency === 'RUB' ? perDiem.amount : 0;
  return {
    days,
    perDiem,
    hotel,
    taxi,
    totalRub: hotel.compensated + taxi.compensated + perDiemRub,
  };
}

// П. 3: суточные за каждый день, включая дни выезда и возвращения.
function tripDays(trip) {
  const days = daysBetween(trip.start, trip.end) + 1;
  if (days < 1) {
    throw new RangeError('Командировка заканчивается раньше, чем начинается');
  }
  return days;
}

function perDiemFor(days, abroad) {
  const currency = abroad ? 'EUR' : 'RUB';
  return { amount: days * PER_DIEM[currency], currency };
}

// П. 4: до 7 000 за ночь в Москве и Петербурге, до 5 000 в других городах; сверх — отмечаем.
function hotelCosts(city, nights) {
  const limit = BIG_CITIES.has(city) ? 7000 : 5000;
  const overLimit = [];
  let compensated = 0;
  nights.forEach((price, index) => {
    compensated += Math.min(price, limit);
    if (price > limit) {
      overLimit.push(index);
    }
  });
  return { limit, compensated, overLimit };
}

// П. 5: такси в аэропорт и на вокзал, а также после 22:00.
function taxiCosts(rides) {
  const rejected = [];
  let compensated = 0;
  rides.forEach((ride, index) => {
    if (TAXI_DESTINATIONS.has(ride.to) || ride.time >= TAXI_NIGHT_FROM) {
      compensated += ride.price;
    } else {
      rejected.push(index);
    }
  });
  return { compensated, rejected };
}

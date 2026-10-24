// Стоимость одного синхронного поиска Яндекса. Ночью (00:00–08:00 по Москве) дешевле.

import type { YandexSearchPrices } from '../settings/settingsSchema.js';
import type { ToolCallCost } from '../tokenomics/costTypes.js';

const MOSCOW_UTC_OFFSET_HOURS = 3;
const NIGHT_END_HOUR = 8;
const REQUESTS_PER_PRICE_UNIT = 1000;

export function calculateYandexSearchCost(
  prices: YandexSearchPrices,
  requestedAt: Date,
): ToolCallCost {
  const tariff = isMoscowNight(requestedAt) ? 'night' : 'day';
  const pricePerThousand =
    tariff === 'night' ? prices.synchronousNightPerThousand : prices.synchronousDayPerThousand;
  return {
    currency: prices.currency,
    amount: pricePerThousand / REQUESTS_PER_PRICE_UNIT,
    tariffName: tariff,
    pricesCheckedAt: prices.checkedAt,
  };
}

function isMoscowNight(date: Date): boolean {
  const moscowHour = (date.getUTCHours() + MOSCOW_UTC_OFFSET_HOURS) % 24;
  return moscowHour < NIGHT_END_HOUR;
}

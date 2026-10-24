// Считает стоимость одного запроса к модели по таблице цен из harness.config.json.

import type { TokenUsage } from '../model/chatTypes.js';
import type { ModelPrices, Tariff, Weekday } from '../settings/settingsSchema.js';
import type { RequestCost } from './costTypes.js';

const TOKENS_PER_PRICE_UNIT = 1_000_000;

// Индекс совпадает с Date.getUTCDay(): 0 — воскресенье.
const WEEKDAYS_BY_INDEX: Weekday[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

export function calculateCost(
  usage: TokenUsage,
  prices: ModelPrices | undefined,
  requestedAt: Date,
): RequestCost | null {
  if (prices === undefined) {
    // Для модели нет цен — стоимость неизвестна, но токены всё равно покажем.
    return null;
  }
  const tariff = selectTariff(prices.tariffs, requestedAt);
  const inputCacheHit = priceTokens(usage.inputCacheHitTokens, tariff.inputCacheHitPerMillion);
  const inputCacheMiss = priceTokens(usage.inputCacheMissTokens, tariff.inputCacheMissPerMillion);
  const output = priceTokens(usage.outputTokens, tariff.outputPerMillion);
  return {
    currency: prices.currency,
    tariffName: tariff.name,
    inputCacheHit,
    inputCacheMiss,
    output,
    total: inputCacheHit + inputCacheMiss + output,
    pricesCheckedAt: prices.checkedAt,
  };
}

function priceTokens(tokenCount: number, pricePerMillion: number): number {
  return (tokenCount / TOKENS_PER_PRICE_UNIT) * pricePerMillion;
}

// Сначала ищем тариф, в расписание которого попадает время запроса,
// иначе берём тариф без расписания — он действует всё остальное время.
function selectTariff(tariffs: Tariff[], requestedAt: Date): Tariff {
  const scheduledTariff = tariffs.find((tariff) => isWithinSchedule(tariff, requestedAt));
  if (scheduledTariff !== undefined) {
    return scheduledTariff;
  }
  const defaultTariff = tariffs.find((tariff) => tariff.schedule === undefined);
  if (defaultTariff !== undefined) {
    return defaultTariff;
  }
  const firstTariff = tariffs[0];
  if (firstTariff === undefined) {
    throw new Error('В таблице цен нет ни одного тарифа');
  }
  return firstTariff;
}

function isWithinSchedule(tariff: Tariff, requestedAt: Date): boolean {
  if (tariff.schedule === undefined) {
    return false;
  }
  const weekday = WEEKDAYS_BY_INDEX[requestedAt.getUTCDay()];
  if (weekday === undefined || !tariff.schedule.weekdaysUtc.includes(weekday)) {
    return false;
  }
  const hour = requestedAt.getUTCHours();
  return tariff.schedule.hoursUtc.some((range) => hour >= range.fromHour && hour < range.toHour);
}

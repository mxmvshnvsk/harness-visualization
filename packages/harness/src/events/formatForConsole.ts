// Вспомогательные функции форматирования для вывода в консоль.

import type { TokenUsage } from '../model/chatTypes.js';
import type { RequestCost, SessionCost, ToolCostTotal } from '../tokenomics/costTypes.js';

const PREVIEW_LENGTH = 300;

export function formatNumber(value: number): string {
  return value.toLocaleString('ru-RU');
}

export function formatMoney(cost: RequestCost | SessionCost | ToolCostTotal | null): string {
  if (cost === null) {
    return 'стоимость неизвестна';
  }
  return formatAmount(cost.total, cost.currency);
}

export function formatAmount(amount: number, currency: string): string {
  // Запросы стоят доли цента, поэтому для маленьких сумм показываем больше знаков.
  const digits = amount < 0.01 ? 6 : 4;
  return `${amount.toFixed(digits)} ${currency}`;
}

// 1 вызов, 2 вызова, 5 вызовов, 21 вызов.
export function formatCallCount(calls: number): string {
  const lastTwoDigits = calls % 100;
  const lastDigit = calls % 10;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
    return `${calls} вызовов`;
  }
  if (lastDigit === 1) {
    return `${calls} вызов`;
  }
  if (lastDigit >= 2 && lastDigit <= 4) {
    return `${calls} вызова`;
  }
  return `${calls} вызовов`;
}

export function formatUsage(usage: TokenUsage): string {
  const input = `input ${formatNumber(usage.inputTokens)} (cache hit ${formatNumber(usage.inputCacheHitTokens)})`;
  const reasoning =
    usage.reasoningTokens > 0 ? ` (reasoning ${formatNumber(usage.reasoningTokens)})` : '';
  const output = `output ${formatNumber(usage.outputTokens)}${reasoning}`;
  return `${input}, ${output}`;
}

export function shortenForPreview(text: string): string {
  // Схлопываем любые пробельные символы, включая \r: в терминале он возвращает
  // курсор в начало строки, и следующий текст затирает уже напечатанный.
  const singleLine = text.replace(/\s+/g, ' ').trim();
  if (singleLine.length <= PREVIEW_LENGTH) {
    return singleLine;
  }
  return `${singleLine.slice(0, PREVIEW_LENGTH)}…`;
}

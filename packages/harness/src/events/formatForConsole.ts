// Вспомогательные функции форматирования для вывода в консоль.

import type { TokenUsage } from '../model/chatTypes.js';
import type { RequestCost, SessionCost } from '../tokenomics/costTypes.js';

const PREVIEW_LENGTH = 300;

export function formatNumber(value: number): string {
  return value.toLocaleString('ru-RU');
}

export function formatMoney(cost: RequestCost | SessionCost | null): string {
  if (cost === null) {
    return 'стоимость неизвестна';
  }
  // Запросы стоят доли цента, поэтому для маленьких сумм показываем больше знаков.
  const digits = cost.total < 0.01 ? 6 : 4;
  return `${cost.total.toFixed(digits)} ${cost.currency}`;
}

export function formatUsage(usage: TokenUsage): string {
  const input = `вход ${formatNumber(usage.inputTokens)} (из кэша ${formatNumber(usage.inputCacheHitTokens)})`;
  const reasoning =
    usage.reasoningTokens > 0 ? ` (рассуждения ${formatNumber(usage.reasoningTokens)})` : '';
  const output = `выход ${formatNumber(usage.outputTokens)}${reasoning}`;
  return `${input}, ${output}`;
}

export function shortenForPreview(text: string): string {
  const singleLine = text.replaceAll('\n', ' ').trim();
  if (singleLine.length <= PREVIEW_LENGTH) {
    return singleLine;
  }
  return `${singleLine.slice(0, PREVIEW_LENGTH)}…`;
}

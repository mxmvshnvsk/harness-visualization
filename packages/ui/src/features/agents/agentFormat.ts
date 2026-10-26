// Подписи вкладки «Агенты»: имя агента, числа и время.

import { formatRu } from '../../text/formatNumber';

export function agentName(id: string): string {
  return id === 'main' ? 'главный агент' : id;
}

export function formatTokens(value: number): string {
  return formatRu(value);
}

export function formatSeconds(ms: number): string {
  return `${formatRu(ms / 1000, { maximumFractionDigits: 1 })} с`;
}

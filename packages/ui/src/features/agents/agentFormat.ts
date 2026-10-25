// Подписи вкладки «Агенты»: имя агента, числа и время.

export function agentName(id: string): string {
  return id === 'main' ? 'главный агент' : id;
}

export function formatTokens(value: number): string {
  return value.toLocaleString('ru-RU');
}

export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} с`;
}

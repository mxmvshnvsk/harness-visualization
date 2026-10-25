// Длительности фаз запроса: всегда с одной цифрой после запятой — 0,7 с, 1,9 с, 3,3 с,
// чтобы соседние фазы читались ровно.

export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} с`;
}

export function formatMilliseconds(ms: number): string {
  return `${ms.toLocaleString('ru-RU')} мс`;
}

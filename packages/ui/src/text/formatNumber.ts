// Числа по-русски через Intl.NumberFormat с кэшем. value.toLocaleString('ru-RU', …) каждый раз
// создаёт форматтер заново — это заметно дороже самого форматирования, а интерфейс форматирует
// числа сотнями: на каждой строке инспектора, в ленте плеера на каждом движении мыши, в счётчике
// времени на каждом кадре повтора (профиль 26.10.2026).

const formatters = new Map<string, Intl.NumberFormat>();

export function formatRu(value: number, options?: Intl.NumberFormatOptions): string {
  const key = options === undefined ? '' : JSON.stringify(options);
  let formatter = formatters.get(key);
  if (formatter === undefined) {
    formatter = new Intl.NumberFormat('ru-RU', options);
    formatters.set(key, formatter);
  }
  return formatter.format(value);
}

// Дробное число с фиксированным числом знаков, по-русски — с запятой: «2,7», «0,000397».
// Заменяет toFixed в тексте для человека; точка остаётся в данных — JSON, адресе, атрибутах SVG и
// дословных цитатах того, что видела модель.
export function formatFixed(value: number, digits: number): string {
  return formatRu(value, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

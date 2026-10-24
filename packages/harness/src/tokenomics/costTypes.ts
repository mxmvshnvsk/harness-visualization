// Типы стоимости: одного запроса к модели и всей сессии.

export interface RequestCost {
  currency: string;
  // Какой тариф применён: например, peak или offPeak у DeepSeek.
  tariffName: string;
  inputCacheHit: number;
  inputCacheMiss: number;
  output: number;
  total: number;
  // Когда проверяли цены — стоимость не точнее таблицы цен.
  pricesCheckedAt: string;
}

export interface SessionCost {
  currency: string;
  total: number;
}

// Типы стоимости: запроса к модели, вызова платного тула и всей сессии.

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

// Стоимость одного вызова тула, который ходит в платный сервис (например, поиск Яндекса).
export interface ToolCallCost {
  currency: string;
  amount: number;
  // Какой тариф применён: например, day или night у Яндекса.
  tariffName: string;
  pricesCheckedAt: string;
}

export interface SessionCost {
  currency: string;
  total: number;
}

// Сколько за сессию стоили вызовы одного тула в одной валюте.
// Валюты не складываем: курс меняется, а пересчёт скрыл бы, кто сколько стоит.
export interface ToolCostTotal {
  toolName: string;
  currency: string;
  total: number;
  calls: number;
}

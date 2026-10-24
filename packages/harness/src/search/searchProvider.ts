// Интерфейс поискового провайдера. Тул web_search знает только его,
// поэтому Tavily можно заменить другим поиском, не трогая тул.

export interface SearchResult {
  title: string;
  url: string;
  // Короткий фрагмент страницы, подходящий к запросу.
  snippet: string;
  // Насколько результат подходит запросу, по оценке провайдера; null, если оценки нет.
  score: number | null;
}

export interface SearchResponse {
  results: SearchResult[];
  // Подробности для трейса и токеномики: кредиты, время ответа и т. п.
  details: Record<string, unknown>;
}

export interface SearchProvider {
  readonly name: string;
  search(query: string, maxResults: number): Promise<SearchResponse>;
}

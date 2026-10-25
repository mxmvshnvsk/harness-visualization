// Типы проверки claims (утверждений) ответа — уровни 2 и 3 проверки опоры ответа (этап 5b).
// Уровень 1 — ссылки на источники (referenceTypes.ts).

import type { SourceLevel } from './referenceTypes.js';

// Claim — одно утверждение ответа: предложение, пункт списка или строка таблицы.
export interface Claim {
  // Номер по порядку в ответе, с единицы.
  number: number;
  // Текст без разметки Markdown.
  text: string;
  kind: 'sentence' | 'listItem' | 'tableRow';
}

// Текст, который модель получила в сессии: результат тула или найденное харнессом до запроса.
export interface SeenText {
  eventSequence: number;
  // Тул, который вернул текст; у найденного харнессом — тул поиска харнесса.
  toolName: string;
  // Кто вызвал тул: модель (tool_result) или сам харнесс (context_retrieved).
  calledBy: 'model' | 'harness';
  // Целиком (read_document, read_file, fetch_url), snippet в выдаче поиска или строка каталога.
  level: Exclude<SourceLevel, 'notSeen'>;
  text: string;
}

export interface QuoteCheck {
  // Цитата, как она стоит в ответе, без кавычек.
  quote: string;
  // Где модель видела этот текст дословно; null — нигде в трейсе.
  foundIn: SeenText | null;
}

export interface ClaimCheck {
  claim: Claim;
  quotes: QuoteCheck[];
}

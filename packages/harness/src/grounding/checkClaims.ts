// Проверка claims ответа (этап 5b): разбить ответ на claims и для каждого найти,
// на что он опирается. Пока — дословные цитаты (5b.1); дальше добавятся сходство
// с увиденными фрагментами (5b.2) и мнение модели-судьи (5b.3).

import type { ClaimCheck, SeenText } from './claimTypes.js';
import { extractQuotes, locateQuote } from './findQuotes.js';
import { splitIntoClaims } from './splitIntoClaims.js';

export function checkClaims(answer: string, seenTexts: SeenText[]): ClaimCheck[] {
  return splitIntoClaims(answer).map((claim) => ({
    claim,
    quotes: extractQuotes(claim.text).map((quote) => locateQuote(quote, seenTexts)),
  }));
}

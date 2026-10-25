// Дословные цитаты в claim и где модель видела их текст. Самая надёжная проверка опоры:
// если фраза в кавычках есть подстрокой в том, что модель получила, — она её не придумала.
//
// «Дословно» — после нормализации, которая не меняет смысла, но убирает расхождения формы:
// регистр, ё/е, разметка Markdown (** и `), виды тире и пробелов, точка в конце цитаты.
// Без неё «**Гибридный** — основной» в документе не совпало бы с «гибридный - основной» в ответе.

import type { QuoteCheck, SeenText } from './claimTypes.js';

// Короче — не цитата, а название: «Улей», «Доступы», «Ракета».
const MIN_QUOTE_WORDS = 3;
const QUOTE_PATTERNS = [/«([^«»]+)»/g, /“([^“”]+)”/g, /"([^"]+)"/g];
const LEVEL_STRENGTH: Record<SeenText['level'], number> = { full: 0, fragment: 1, catalog: 2 };

export function extractQuotes(text: string): string[] {
  const quotes: string[] = [];
  for (const pattern of QUOTE_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const quote = match[1]?.trim() ?? '';
      if (quote.split(/\s+/).length >= MIN_QUOTE_WORDS) {
        quotes.push(quote);
      }
    }
  }
  return quotes;
}

// Если цитата встречается в нескольких текстах, берём самый сильный: целиком лучше snippet.
export function locateQuote(quote: string, seenTexts: SeenText[]): QuoteCheck {
  const normalizedQuote = normalizeForQuote(quote);
  const matches = seenTexts
    .filter((seen) => normalizeForQuote(seen.text).includes(normalizedQuote))
    .sort((first, second) => LEVEL_STRENGTH[first.level] - LEVEL_STRENGTH[second.level]);
  return { quote, foundIn: matches[0] ?? null };
}

export function normalizeForQuote(text: string): string {
  return text
    .toLocaleLowerCase('ru')
    .replace(/ё/g, 'е')
    .replace(/\*\*|__|`/g, '')
    .replace(/[‐‑‒–—―−]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!?…]+$/, '')
    .trim();
}

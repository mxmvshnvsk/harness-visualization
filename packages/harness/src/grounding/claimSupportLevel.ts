// Итоговый уровень опоры claim по проверкам кодом — самый сильный из того, что удалось
// установить (этап 5b.4). Мнение судьи сюда не входит: оно показывается рядом, отдельно,
// потому что это мнение, а не проверка.
//
//   quoted        — все цитаты claim найдены дословно в том, что видела модель;
//   quoteNotFound — модель приводит цитату, которой в сессии не получала: самый тревожный случай,
//                   поэтому он важнее любого сходства;
//   close         — без цитат, но сходство с увиденным не ниже порога: «про то же»;
//   far           — сходство ниже порога: повод проверить глазами;
//   unchecked     — сходство не считалось (нет модели эмбеддингов).

import type { ClaimCheck } from './claimTypes.js';

export const CLAIM_SUPPORT_LEVELS = [
  'quoted',
  'quoteNotFound',
  'close',
  'far',
  'unchecked',
] as const;

export type ClaimSupportLevel = (typeof CLAIM_SUPPORT_LEVELS)[number];

export function claimSupportLevel(checked: ClaimCheck, threshold: number): ClaimSupportLevel {
  if (checked.quotes.some((quote) => quote.foundIn === null)) {
    return 'quoteNotFound';
  }
  if (checked.quotes.length > 0) {
    return 'quoted';
  }
  if (checked.similarity === null) {
    return 'unchecked';
  }
  return checked.similarity.score >= threshold ? 'close' : 'far';
}

// Где проверка кодом и судья расходятся — самое интересное место для разбора:
// «про то же» по сходству, а судья видит противоречие; или наоборот.
export function disagreesWithJudge(checked: ClaimCheck, level: ClaimSupportLevel): boolean {
  const verdict = checked.judge?.verdict;
  if (verdict === undefined || verdict === 'unclear') {
    return false;
  }
  const codeSupports = level === 'quoted' || level === 'close';
  const judgeSupports = verdict === 'supported';
  return codeSupports !== judgeSupports;
}

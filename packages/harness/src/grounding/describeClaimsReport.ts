// Печатает в консоль раздел отчёта про claims (утверждения) ответа: по каждому — на что
// он опирается. Пока это дословные цитаты (5b.1); claim без цитаты ждёт проверки сходством (5b.2).

import { styleText } from 'node:util';
import type { ClaimCheck, QuoteCheck, SeenText } from './claimTypes.js';

const CLAIM_PREVIEW_LENGTH = 110;

const LEVEL_LABELS: Record<SeenText['level'], string> = {
  full: 'целиком',
  fragment: 'snippet',
  catalog: 'строка каталога',
};

export function describeClaimsReport(claims: ClaimCheck[]): string[] {
  if (claims.length === 0) {
    return [styleText('dim', 'Claims (утверждения) в ответе не найдены.')];
  }
  const lines = [
    `Claims (утверждения) ответа: ${String(claims.length)}`,
    styleText(
      'dim',
      '  Разбиение грубое: по предложениям, пунктам списка и строкам таблиц; заголовки и подписи пропущены.',
    ),
  ];
  for (const checked of claims) {
    lines.push(...describeClaim(checked));
  }
  lines.push('', describeQuotesSummary(claims));
  return lines;
}

function describeClaim(checked: ClaimCheck): string[] {
  const head = `  ${String(checked.claim.number)}. ${shorten(checked.claim.text)}`;
  if (checked.quotes.length === 0) {
    return [styleText('dim', head)];
  }
  return [head, ...checked.quotes.map(describeQuote)];
}

function describeQuote(quote: QuoteCheck): string {
  if (quote.foundIn === null) {
    return styleText(
      'red',
      `     ✗ цитата «${shorten(quote.quote)}» — такого текста модель в сессии не получала`,
    );
  }
  const seen = quote.foundIn;
  const caller = seen.calledBy === 'harness' ? 'подмешал харнесс' : 'вызвала модель';
  return styleText(
    'green',
    `     ✓ цитата «${shorten(quote.quote)}» — дословно в событии #${String(seen.eventSequence)}: ` +
      `${seen.toolName} (${caller}), ${LEVEL_LABELS[seen.level]}`,
  );
}

function describeQuotesSummary(claims: ClaimCheck[]): string {
  const quotes = claims.flatMap((checked) => checked.quotes);
  const withoutQuotes = claims.filter((checked) => checked.quotes.length === 0).length;
  const tail = `Без цитат — ${String(withoutQuotes)} claims: их проверит сходство с увиденным (5b.2).`;
  if (quotes.length === 0) {
    return styleText('dim', `Цитат в ответе нет. ${tail}`);
  }
  const found = quotes.filter((quote) => quote.foundIn !== null).length;
  const summary = `Цитаты: найдено дословно ${String(found)} из ${String(quotes.length)}. ${tail}`;
  return styleText(found === quotes.length ? 'green' : 'red', summary);
}

function shorten(text: string): string {
  return text.length <= CLAIM_PREVIEW_LENGTH ? text : `${text.slice(0, CLAIM_PREVIEW_LENGTH)}…`;
}

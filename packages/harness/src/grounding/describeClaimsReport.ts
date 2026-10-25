// Печатает в консоль раздел отчёта про claims (утверждения) ответа: по каждому — на что
// он опирается: дословные цитаты (5b.1) и ближайший кусок увиденного по сходству (5b.2).

import { styleText } from 'node:util';
import type { JudgeVerdict } from '../events/harnessEvents.js';
import type {
  ClaimCheck,
  JudgeOpinion,
  QuoteCheck,
  SeenText,
  SimilarityMatch,
} from './claimTypes.js';

const CLAIM_PREVIEW_LENGTH = 110;
const PASSAGE_PREVIEW_LENGTH = 80;
const SCORE_DIGITS = 3;

export interface ClaimsReportOptions {
  similarityThreshold: number;
  // Почему сходство не считалось; null — считалось.
  similaritySkippedReason: string | null;
}

const VERDICT_LABELS: Record<JudgeVerdict, string> = {
  supported: 'подтверждает (supported)',
  contradicted: 'противоречит (contradicted)',
  notFound: 'в показанном нет (notFound)',
  unclear: 'ответ не разобрался (unclear)',
};

const LEVEL_LABELS: Record<SeenText['level'], string> = {
  full: 'целиком',
  fragment: 'snippet',
  catalog: 'строка каталога',
};

export function describeClaimsReport(claims: ClaimCheck[], options: ClaimsReportOptions): string[] {
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
  if (options.similaritySkippedReason === null) {
    lines.push(
      styleText(
        'dim',
        `  ≈ — сходство embeddings с ближайшей строкой увиденного; «близко» от ${String(options.similarityThreshold)} ` +
          '(grounding.similarityThreshold, порог приблизительный). Близко — значит «про то же», ' +
          'а не «то же утверждает»: «до трёх дней» и «до двух дней» близки одинаково.',
      ),
    );
  }
  for (const checked of claims) {
    lines.push(...describeClaim(checked, options.similarityThreshold));
  }
  lines.push('', describeQuotesSummary(claims), describeSimilaritySummary(claims, options));
  const judgeSummary = describeJudgeSummary(claims);
  if (judgeSummary !== null) {
    lines.push(judgeSummary);
  }
  return lines;
}

function describeClaim(checked: ClaimCheck, threshold: number): string[] {
  const lines = [
    `  ${String(checked.claim.number)}. ${shorten(checked.claim.text, CLAIM_PREVIEW_LENGTH)}`,
  ];
  lines.push(...checked.quotes.map(describeQuote));
  if (checked.similarity !== null) {
    lines.push(describeSimilarity(checked.similarity, threshold));
  }
  if (checked.judge !== null) {
    lines.push(describeJudge(checked.judge));
  }
  return lines;
}

// Мнение — другим цветом и с пометкой, чтобы его не спутали с проверкой кодом.
function describeJudge(opinion: JudgeOpinion): string {
  return styleText(
    'magenta',
    `     ⚖ мнение судьи: ${VERDICT_LABELS[opinion.verdict]} — ${opinion.explanation}`,
  );
}

function describeSimilarity(match: SimilarityMatch, threshold: number): string {
  const isClose = match.score >= threshold;
  const verdict = isClose ? 'близко' : 'далеко';
  const where = describeSeen(match.seen);
  const document = match.documentId === null ? '' : `, ${match.documentId}`;
  const passage = shorten(match.passage, PASSAGE_PREVIEW_LENGTH);
  return styleText(
    isClose ? 'green' : 'yellow',
    `     ≈ ${match.score.toFixed(SCORE_DIGITS)} ${verdict}: ${where}${document} — «${passage}»`,
  );
}

function describeSeen(seen: SeenText): string {
  const caller = seen.calledBy === 'harness' ? 'подмешал харнесс' : 'вызвала модель';
  return `#${String(seen.eventSequence)} ${seen.toolName} (${caller}), ${LEVEL_LABELS[seen.level]}`;
}

function describeJudgeSummary(claims: ClaimCheck[]): string | null {
  const opinions = claims.flatMap((checked) => (checked.judge === null ? [] : [checked.judge]));
  if (opinions.length === 0) {
    return null;
  }
  const counts = (Object.keys(VERDICT_LABELS) as JudgeVerdict[])
    .map((verdict) => ({
      verdict,
      count: opinions.filter((opinion) => opinion.verdict === verdict).length,
    }))
    .filter((item) => item.count > 0)
    .map((item) => `${VERDICT_LABELS[item.verdict]} ${String(item.count)}`);
  return styleText(
    'magenta',
    `Мнение судьи (не проверка): ${counts.join(', ')}. Судья — тоже модель и может ошибаться.`,
  );
}

function describeSimilaritySummary(claims: ClaimCheck[], options: ClaimsReportOptions): string {
  if (options.similaritySkippedReason !== null) {
    return styleText('yellow', `Сходство не считалось: ${options.similaritySkippedReason}`);
  }
  const measured = claims.filter((checked) => checked.similarity !== null);
  const close = measured.filter(
    (checked) => (checked.similarity?.score ?? 0) >= options.similarityThreshold,
  ).length;
  return styleText(
    'dim',
    `Сходство: близко к увиденному ${String(close)} из ${String(measured.length)} claims ` +
      `(порог ${String(options.similarityThreshold)}). Далеко — повод проверить claim глазами, а не приговор.`,
  );
}

function describeQuote(quote: QuoteCheck): string {
  if (quote.foundIn === null) {
    return styleText(
      'red',
      `     ✗ цитата «${shorten(quote.quote, CLAIM_PREVIEW_LENGTH)}» — такого текста модель в сессии не получала`,
    );
  }
  return styleText(
    'green',
    `     ✓ цитата «${shorten(quote.quote, CLAIM_PREVIEW_LENGTH)}» — дословно: ${describeSeen(quote.foundIn)}`,
  );
}

function describeQuotesSummary(claims: ClaimCheck[]): string {
  const quotes = claims.flatMap((checked) => checked.quotes);
  const withoutQuotes = claims.filter((checked) => checked.quotes.length === 0).length;
  const tail = `Без цитат — ${String(withoutQuotes)} claims.`;
  if (quotes.length === 0) {
    return styleText('dim', `Цитат в ответе нет. ${tail}`);
  }
  const found = quotes.filter((quote) => quote.foundIn !== null).length;
  const summary = `Цитаты: найдено дословно ${String(found)} из ${String(quotes.length)}. ${tail}`;
  return styleText(found === quotes.length ? 'green' : 'red', summary);
}

function shorten(text: string, length: number): string {
  return text.length <= length ? text : `${text.slice(0, length)}…`;
}

// Печатает в консоль раздел отчёта про claims (утверждения) ответа: по каждому — итоговый
// уровень опоры по проверкам кодом (5b.4), дословные цитаты (5b.1), ближайшая строка
// увиденного по сходству (5b.2) и отдельно — мнение судьи (5b.3).

import { styleText } from 'node:util';
import type { JudgeVerdict } from '../events/harnessEvents.js';
import {
  CLAIM_SUPPORT_LEVELS,
  claimSupportLevel,
  disagreesWithJudge,
  type ClaimSupportLevel,
} from './claimSupportLevel.js';
import type {
  ClaimCheck,
  JudgeOpinion,
  QuoteCheck,
  SeenText,
  SimilarityMatch,
} from './claimTypes.js';
import { formatFixed } from '../events/formatForConsole.js';

const CLAIM_PREVIEW_LENGTH = 110;
const PASSAGE_PREVIEW_LENGTH = 80;
const SCORE_DIGITS = 3;

export interface ClaimsReportOptions {
  similarityThreshold: number;
  // Почему сходство не считалось; null — считалось.
  similaritySkippedReason: string | null;
}

interface SupportLevelStyle {
  icon: string;
  color: Parameters<typeof styleText>[0];
  label: string;
}

const SUPPORT_LEVEL_STYLES: Record<ClaimSupportLevel, SupportLevelStyle> = {
  quoted: { icon: '❝', color: 'green', label: 'цитата найдена дословно' },
  quoteNotFound: { icon: '✗', color: 'red', label: 'цитаты нет в увиденном' },
  close: { icon: '≈', color: 'green', label: 'про то же по сходству' },
  far: { icon: '?', color: 'yellow', label: 'далеко по сходству' },
  unchecked: { icon: '·', color: 'dim', label: 'не проверялось' },
};

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
    styleText(
      'dim',
      `  Значок у claim — самый сильный уровень опоры по проверкам кодом: ${describeLegend()}. Мнение судьи — отдельно.`,
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
  lines.push(
    '',
    describeLevelsSummary(claims, options.similarityThreshold),
    describeQuotesSummary(claims),
    describeSimilaritySummary(claims, options),
  );
  const judgeSummary = describeJudgeSummary(claims);
  if (judgeSummary !== null) {
    lines.push(judgeSummary, ...describeDisagreements(claims, options.similarityThreshold));
  }
  return lines;
}

function describeClaim(checked: ClaimCheck, threshold: number): string[] {
  const style = SUPPORT_LEVEL_STYLES[claimSupportLevel(checked, threshold)];
  const number = styleText(style.color, `${style.icon} ${String(checked.claim.number)}.`);
  const lines = [`  ${number} ${shorten(checked.claim.text, CLAIM_PREVIEW_LENGTH)}`];
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
    `     ≈ ${formatFixed(match.score, SCORE_DIGITS)} ${verdict}: ${where}${document} — «${passage}»`,
  );
}

function describeSeen(seen: SeenText): string {
  const caller = seen.calledBy === 'harness' ? 'подмешал харнесс' : 'вызвала модель';
  return `#${String(seen.eventSequence)} ${seen.toolName} (${caller}), ${LEVEL_LABELS[seen.level]}`;
}

function describeLegend(): string {
  return CLAIM_SUPPORT_LEVELS.map(
    (level) => `${SUPPORT_LEVEL_STYLES[level].icon} ${SUPPORT_LEVEL_STYLES[level].label}`,
  ).join(', ');
}

function describeLevelsSummary(claims: ClaimCheck[], threshold: number): string {
  const parts = CLAIM_SUPPORT_LEVELS.map((level) => ({
    level,
    count: claims.filter((checked) => claimSupportLevel(checked, threshold) === level).length,
  }))
    .filter((item) => item.count > 0)
    .map((item) => {
      const style = SUPPORT_LEVEL_STYLES[item.level];
      return styleText(style.color, `${style.icon} ${style.label} ${String(item.count)}`);
    });
  return `Опора claims по проверкам кодом: ${parts.join(', ')}.`;
}

// Расхождения кода и судьи — главное, на что стоит посмотреть глазами.
function describeDisagreements(claims: ClaimCheck[], threshold: number): string[] {
  const disagreements = claims.filter((checked) =>
    disagreesWithJudge(checked, claimSupportLevel(checked, threshold)),
  );
  if (disagreements.length === 0) {
    return [styleText('dim', 'Код и судья не расходятся ни в одном claim.')];
  }
  return [
    styleText(
      'bold',
      `Код и судья расходятся в ${String(disagreements.length)} claims — посмотрите их глазами:`,
    ),
    ...disagreements.map((checked) => {
      const style = SUPPORT_LEVEL_STYLES[claimSupportLevel(checked, threshold)];
      const verdict = checked.judge === null ? '' : VERDICT_LABELS[checked.judge.verdict];
      return `  ${String(checked.claim.number)}. код: ${style.label}; судья: ${verdict}`;
    }),
  ];
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

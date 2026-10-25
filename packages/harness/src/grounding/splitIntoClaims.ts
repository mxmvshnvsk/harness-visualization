// Разбивает ответ модели на claims (утверждения): предложения, пункты списков, строки таблиц.
// Разбиение грубое и честно таким называется в отчёте: ответ — Markdown со списками,
// таблицами и жирным текстом, а понять, где кончается одна мысль, по-настоящему может
// только человек или модель. Пропускаем то, что утверждением не является: заголовки,
// подписи разделов («**Правила**»), вводные строки с двоеточием («Источники:»), код.

import type { Claim } from './claimTypes.js';

// Короче этого — не утверждение, а подпись или обрывок: «Коротко:», «Итог».
const MIN_CLAIM_LENGTH = 20;

const HEADING_PATTERN = /^#{1,6}\s/;
const LIST_MARKER_PATTERN = /^(?:[-*+]|\d+[.)])\s+/;
const TABLE_SEPARATOR_PATTERN = /^\|?\s*:?-{3,}/;
const SECTION_LABEL_PATTERN = /^\*\*[^*]+\*\*:?$/;
const CODE_FENCE = '```';
// Конец предложения: знак, пробел и заглавная буква или открывающая кавычка/скобка.
// Цифра или строчная буква после точки конец не означает: «п. 2.1», «доп. соглашение».
const SENTENCE_END_MARKS = '.!?…';
const SENTENCE_START_PATTERN = /[«"(A-ZА-ЯЁ]/u;

interface RawClaim {
  text: string;
  kind: Claim['kind'];
}

export function splitIntoClaims(answer: string): Claim[] {
  return collectRawClaims(answer.split('\n'))
    .map((raw) => ({ ...raw, text: stripMarkdown(raw.text) }))
    .filter((raw) => isClaim(raw.text))
    .map((raw, index) => ({ number: index + 1, text: raw.text, kind: raw.kind }));
}

function collectRawClaims(lines: string[]): RawClaim[] {
  const claims: RawClaim[] = [];
  let insideCode = false;
  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (line.startsWith(CODE_FENCE)) {
      insideCode = !insideCode;
      return;
    }
    if (insideCode || shouldSkipLine(line, lines[index + 1])) {
      return;
    }
    claims.push(...claimsOfLine(line));
  });
  return claims;
}

// Строка таблицы, за которой идёт разделитель, — шапка с названиями столбцов.
function shouldSkipLine(line: string, nextLine: string | undefined): boolean {
  if (line === '' || HEADING_PATTERN.test(line) || TABLE_SEPARATOR_PATTERN.test(line)) {
    return true;
  }
  if (SECTION_LABEL_PATTERN.test(line)) {
    return true;
  }
  return line.startsWith('|') && TABLE_SEPARATOR_PATTERN.test(nextLine?.trim() ?? '');
}

function claimsOfLine(line: string): RawClaim[] {
  if (line.startsWith('|')) {
    const cells = line
      .split('|')
      .map((cell) => cell.trim())
      .filter((cell) => cell !== '');
    return [{ text: cells.join(' · '), kind: 'tableRow' }];
  }
  const isListItem = LIST_MARKER_PATTERN.test(line);
  const text = line.replace(LIST_MARKER_PATTERN, '');
  return splitSentences(text).map((sentence) => ({
    text: sentence,
    kind: isListItem ? 'listItem' : 'sentence',
  }));
}

// Внутри кавычек не режем: цитата «Можно ли? Да» — одно утверждение, а не два.
function splitSentences(text: string): string[] {
  const sentences: string[] = [];
  let start = 0;
  let insideQuote = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index] ?? '';
    insideQuote = updateQuoteState(character, insideQuote);
    if (!insideQuote && isSentenceEnd(text, index)) {
      sentences.push(text.slice(start, index + 1).trim());
      start = index + 1;
    }
  }
  sentences.push(text.slice(start).trim());
  return sentences.filter((sentence) => sentence !== '');
}

function updateQuoteState(character: string, insideQuote: boolean): boolean {
  if (character === '«') {
    return true;
  }
  if (character === '»') {
    return false;
  }
  return character === '"' ? !insideQuote : insideQuote;
}

// Знак конца, затем пробел, затем начало нового предложения.
function isSentenceEnd(text: string, index: number): boolean {
  const character = text[index] ?? '';
  if (!SENTENCE_END_MARKS.includes(character) || text[index + 1] !== ' ') {
    return false;
  }
  return SENTENCE_START_PATTERN.test(text[index + 2] ?? '');
}

// [текст](адрес) → текст; **жирный**, *курсив*, `код` → без разметки.
function stripMarkdown(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*|__|`/g, '')
    .replace(/(?<![\p{L}\d])\*(?=\S)|(?<=\S)\*(?![\p{L}\d])/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isClaim(text: string): boolean {
  if (text.length < MIN_CLAIM_LENGTH || text.endsWith(':')) {
    return false;
  }
  return /\p{L}/u.test(text);
}

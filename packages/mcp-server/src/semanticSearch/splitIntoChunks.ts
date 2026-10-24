// Нарезка документа на фрагменты для эмбеддингов.
//
// Модель multilingual-e5-small читает не больше 512 токенов, а всё, что дальше,
// отбрасывает без предупреждения. Около 700 символов русского текста — заметно
// меньше предела, с запасом на название документа, которое добавляется к фрагменту.
//
// Режем по абзацам, чтобы не рвать мысль посередине. Абзац длиннее предела
// (обычно таблица) режется по строкам. Следующий фрагмент начинается с последнего
// абзаца предыдущего: если ответ лежит на стыке двух фрагментов, он целиком
// попадёт хотя бы в один из них.

import type { KnowledgeDocument } from '../knowledgeBase/documentTypes.js';
import type { DocumentChunk } from './documentChunk.js';

export const CHUNK_TARGET_LENGTH = 700;

const PARAGRAPH_SEPARATOR = /\n\s*\n/;
const PARAGRAPH_JOINER = '\n\n';
// Шапка таблицы Markdown — строка названий столбцов и строка-разделитель «| --- |».
const TABLE_HEADER_LINE_COUNT = 2;
const TABLE_SEPARATOR_LINE = /^\|[\s|:-]+\|$/;

export function splitIntoChunks(document: KnowledgeDocument): DocumentChunk[] {
  const texts = groupIntoChunks(splitIntoPieces(document.body));
  return texts.map((text, index) => ({
    document,
    position: index + 1,
    totalInDocument: texts.length,
    text,
  }));
}

// Абзацы документа; абзацы длиннее предела порезаны по строкам.
function splitIntoPieces(body: string): string[] {
  return body
    .split(PARAGRAPH_SEPARATOR)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== '')
    .flatMap((paragraph) => {
      if (paragraph.length > CHUNK_TARGET_LENGTH) {
        return splitLongParagraph(paragraph);
      }
      return [paragraph];
    });
}

// Строки собираются в куски не длиннее предела. Строка длиннее предела остаётся
// целой: резать посреди предложения хуже, чем немного превысить предел.
// У таблицы шапка повторяется в каждом куске: строка «| Мария Орлова | Кадры |»
// без названий столбцов теряет смысл.
function splitLongParagraph(paragraph: string): string[] {
  const lines = paragraph.split('\n');
  const header = isTable(lines) ? lines.slice(0, TABLE_HEADER_LINE_COUNT) : [];
  const parts: string[] = [];
  let currentRows: string[] = [];
  for (const row of lines.slice(header.length)) {
    const candidate = [...header, ...currentRows, row].join('\n');
    if (currentRows.length > 0 && candidate.length > CHUNK_TARGET_LENGTH) {
      parts.push([...header, ...currentRows].join('\n'));
      currentRows = [];
    }
    currentRows.push(row);
  }
  if (currentRows.length > 0) {
    parts.push([...header, ...currentRows].join('\n'));
  }
  return parts;
}

function isTable(lines: string[]): boolean {
  const separatorLine = lines[1]?.trim() ?? '';
  return lines[0]?.trim().startsWith('|') === true && TABLE_SEPARATOR_LINE.test(separatorLine);
}

function groupIntoChunks(pieces: string[]): string[] {
  const chunks: string[] = [];
  let currentPieces: string[] = [];
  for (const piece of pieces) {
    const candidate = [...currentPieces, piece].join(PARAGRAPH_JOINER);
    if (candidate.length > CHUNK_TARGET_LENGTH && currentPieces.some(isNotHeading)) {
      const { closedPieces, carriedPieces } = closeChunk(currentPieces, piece);
      chunks.push(closedPieces.join(PARAGRAPH_JOINER));
      currentPieces = carriedPieces;
    }
    currentPieces.push(piece);
  }
  if (currentPieces.length > 0) {
    chunks.push(currentPieces.join(PARAGRAPH_JOINER));
  }
  return chunks;
}

interface ClosedChunk {
  closedPieces: string[];
  // С чего начнётся следующий фрагмент.
  carriedPieces: string[];
}

// Заголовки в конце фрагмента переходят в следующий: заголовок без текста под ним
// ничего не значит. Если заголовков в конце нет — перекрытие: последний абзац
// переходит в следующий фрагмент, если помещается туда вместе с новым абзацем.
// Фрагмент из одного абзаца не переносится: иначе следующий фрагмент повторял бы его целиком.
function closeChunk(currentPieces: string[], nextPiece: string): ClosedChunk {
  const lastTextIndex = currentPieces.findLastIndex(isNotHeading);
  const closedPieces = currentPieces.slice(0, lastTextIndex + 1);
  const trailingHeadings = currentPieces.slice(lastTextIndex + 1);
  if (trailingHeadings.length > 0) {
    return { closedPieces, carriedPieces: trailingHeadings };
  }
  const lastPiece = closedPieces.at(-1) ?? '';
  const withOverlap = [lastPiece, nextPiece].join(PARAGRAPH_JOINER);
  if (closedPieces.length === 1 || withOverlap.length > CHUNK_TARGET_LENGTH) {
    return { closedPieces, carriedPieces: [] };
  }
  return { closedPieces, carriedPieces: [lastPiece] };
}

function isNotHeading(piece: string): boolean {
  return !piece.startsWith('#');
}

// Нарезка документа для учебного опыта «порежьте сами» — тот же алгоритм, что у MCP-сервера
// (packages/mcp-server/src/semanticSearch/splitIntoChunks.ts), но с размером и перекрытием
// на выбор. На сервере размер — 700 символов, перекрытие включено.

const PARAGRAPH_SEPARATOR = /\n\s*\n/;
const PARAGRAPH_JOINER = '\n\n';

// Текст документа абзацами — из фрагментов сервера, без повторов на стыках (перекрытий).
export function paragraphsOf(chunkTexts: readonly string[]): string[] {
  const paragraphs: string[] = [];
  chunkTexts.forEach((text, index) => {
    let pieces = text
      .split(PARAGRAPH_SEPARATOR)
      .map((piece) => piece.trim())
      .filter((piece) => piece !== '');
    if (index > 0) {
      while (pieces[0] !== undefined && paragraphs.includes(pieces[0])) {
        pieces = pieces.slice(1);
      }
    }
    paragraphs.push(...pieces);
  });
  return paragraphs;
}

// Абзацы — в куски не длиннее target. Заголовок в конце куска уходит в следующий; при
// перекрытии последний абзац куска повторяется в начале следующего, если помещается.
export function chunkParagraphs(
  pieces: readonly string[],
  target: number,
  overlap: boolean,
): string[][] {
  const chunks: string[][] = [];
  let current: string[] = [];
  for (const piece of pieces) {
    if ([...current, piece].join(PARAGRAPH_JOINER).length > target && current.some(isText)) {
      const last = current.findLastIndex(isText);
      const closed = current.slice(0, last + 1);
      chunks.push(closed);
      current = carried(current.slice(last + 1), closed, piece, { target, overlap });
    }
    current.push(piece);
  }
  if (current.length > 0) {
    chunks.push(current);
  }
  return chunks;
}

function carried(
  headings: string[],
  closed: string[],
  next: string,
  { target, overlap }: { target: number; overlap: boolean },
): string[] {
  if (headings.length > 0) {
    return headings;
  }
  const last = closed.at(-1);
  if (!overlap || last === undefined || closed.length === 1) {
    return [];
  }
  return [last, next].join(PARAGRAPH_JOINER).length <= target ? [last] : [];
}

function isText(piece: string): boolean {
  return !piece.startsWith('#');
}

// Режет увиденный моделью текст на строки для сравнения с claims. Claim — обычно одно
// предложение или пункт списка, и сравнивать его честнее с одной строкой источника, чем
// с куском из десятка пунктов: в большом куске нужный факт растворяется. На трейсе 53863eac
// claim «Ноутбук выдаёт отдел инфраструктуры» с куском в 700 символов дал 0.832, со своей
// строкой — 0.878. И в отчёте видна сама строка-источник, а не начало куска.
//
// У каждой строки — документ, к которому она относится: в выдаче поиска это последняя
// строка-заголовок «id — название», в read_document — строка «id: …».

const MIN_LINE_LENGTH = 15;
const MAX_LINE_LENGTH = 700;
const RESULT_HEADER_PATTERN = /^([A-Za-z][\w-]*(?:\/[\w.-]+)+) — /;
const DOCUMENT_ID_PATTERN = /^id: (\S+)/;

export interface SeenLine {
  text: string;
  // null — не удалось понять, из какого документа строка (например, страница из интернета).
  documentId: string | null;
}

export function splitSeenTextIntoLines(text: string): SeenLine[] {
  const lines: SeenLine[] = [];
  let documentId: string | null = null;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    documentId = readDocumentId(line) ?? documentId;
    if (line.length < MIN_LINE_LENGTH) {
      continue;
    }
    for (let start = 0; start < line.length; start += MAX_LINE_LENGTH) {
      lines.push({ text: line.slice(start, start + MAX_LINE_LENGTH), documentId });
    }
  }
  return lines;
}

function readDocumentId(line: string): string | null {
  return RESULT_HEADER_PATTERN.exec(line)?.[1] ?? DOCUMENT_ID_PATTERN.exec(line)?.[1] ?? null;
}

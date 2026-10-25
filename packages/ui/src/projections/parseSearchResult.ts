// Разбор выдачи тулов базы знаний (search, semantic_search, hybrid_search) из текста,
// который видит модель. Формат задаёт MCP-сервер (packages/mcp-server/src/tools): у каждого
// найденного — строка-заголовок «id — название (тип, дата)[, фрагмент i из n][, оценка]»,
// под ней — текст фрагмента; найденные разделены пустой строкой. Документы без заголовка
// (другой формат, чужой сервер) просто не попадут в разбор — вид покажет пустую выдачу.

export interface FoundChunk {
  documentId: string;
  title: string;
  documentType: string;
  date: string;
  fragment: { position: number; total: number } | null;
  // semantic_search: сходство с запросом.
  similarity: number | null;
  // hybrid_search: места в двух выдачах; null — в этой выдаче документа нет.
  places: { words: number | null; meaning: number | null } | null;
  text: string;
}

const HEADER = /^([\w-]+\/[\w-]+) — (.+) \(([\w-]+), ([^)]+)\)(.*)$/u;
const FRAGMENT = /фрагмент (\d+) из (\d+)/u;
const SIMILARITY = /сходство ([\d.]+)/u;
const WORDS_PLACE = /по словам: (?:(\d+)-е место|не найден)/u;
const MEANING_PLACE = /по смыслу: (?:(\d+)-е место|не найден)/u;

export function parseSearchResult(content: string): FoundChunk[] {
  const chunks: FoundChunk[] = [];
  const lines: string[] = [];
  const flush = (): void => {
    const last = chunks.at(-1);
    if (last !== undefined) {
      last.text = lines.join('\n').trim();
    }
    lines.length = 0;
  };
  for (const line of content.split('\n')) {
    const header = HEADER.exec(line);
    if (header === null) {
      lines.push(line);
      continue;
    }
    flush();
    chunks.push(chunkOf(header));
  }
  flush();
  return chunks;
}

function chunkOf(header: RegExpExecArray): FoundChunk {
  const rest = header[5] ?? '';
  const fragment = FRAGMENT.exec(rest);
  const similarity = SIMILARITY.exec(rest);
  const words = WORDS_PLACE.exec(rest);
  const meaning = MEANING_PLACE.exec(rest);
  return {
    documentId: header[1] ?? '',
    title: header[2] ?? '',
    documentType: header[3] ?? '',
    date: header[4] ?? '',
    fragment:
      fragment === null ? null : { position: Number(fragment[1]), total: Number(fragment[2]) },
    similarity: similarity === null ? null : Number(similarity[1]),
    places:
      words === null && meaning === null
        ? null
        : { words: placeOf(words), meaning: placeOf(meaning) },
    text: '',
  };
}

function placeOf(match: RegExpExecArray | null): number | null {
  const place = match?.[1];
  return place === undefined ? null : Number(place);
}

// Разбор подмножества Markdown, на котором написана справка (docs/help/README.md):
// заголовки # и ##, абзацы, списки «- », **жирный**, `код` и ссылки [текст](https://…).
// Результат — дерево блоков, а не HTML: интерфейс строит из него элементы React и не вставляет
// разметку как текст (никакого innerHTML), так что ничего в файлах справки не выполнится.

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'link'; text: string; href: string };

export type Block =
  | { kind: 'title'; inlines: Inline[] }
  | { kind: 'heading'; inlines: Inline[] }
  | { kind: 'paragraph'; inlines: Inline[] }
  | { kind: 'list'; items: Inline[][] };

// Ссылки — только http(s): javascript: и прочие схемы в справке не нужны и опасны.
const INLINE_PATTERN = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gu;

export function parseMarkdown(text: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  const flush = (): void => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'paragraph', inlines: parseInline(paragraph.join(' ')) });
      paragraph = [];
    }
    if (list.length > 0) {
      blocks.push({ kind: 'list', items: list.map(parseInline) });
      list = [];
    }
  };
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line === '') {
      flush();
    } else if (line.startsWith('- ')) {
      if (paragraph.length > 0) {
        flush();
      }
      list.push(line.slice(2));
    } else if (line.startsWith('#')) {
      flush();
      blocks.push(parseHeading(line));
    } else {
      if (list.length > 0) {
        flush();
      }
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}

function parseHeading(line: string): Block {
  const level = line.startsWith('## ') ? 2 : 1;
  const inlines = parseInline(line.replace(/^#+\s*/u, ''));
  return level === 1 ? { kind: 'title', inlines } : { kind: 'heading', inlines };
}

export function parseInline(text: string): Inline[] {
  const inlines: Inline[] = [];
  let position = 0;
  for (const match of text.matchAll(INLINE_PATTERN)) {
    if (match.index > position) {
      inlines.push({ kind: 'text', text: text.slice(position, match.index) });
    }
    inlines.push(toInline(match));
    position = match.index + match[0].length;
  }
  if (position < text.length) {
    inlines.push({ kind: 'text', text: text.slice(position) });
  }
  return inlines;
}

function toInline(match: RegExpExecArray | RegExpMatchArray): Inline {
  const [, strong, code, linkText, href] = match;
  if (strong !== undefined) {
    return { kind: 'strong', text: strong };
  }
  if (code !== undefined) {
    return { kind: 'code', text: code };
  }
  return { kind: 'link', text: linkText ?? '', href: href ?? '' };
}

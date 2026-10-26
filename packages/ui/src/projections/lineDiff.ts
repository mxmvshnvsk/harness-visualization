// Построчный diff двух текстов — для вкладки «Код» (этап 10). Наибольшая общая
// подпоследовательность строк: файлы арены маленькие, квадрат по числу строк не страшен.

export interface DiffLine {
  kind: 'same' | 'add' | 'del';
  text: string;
  // Номер строки в старом и новом тексте; null — строки там нет.
  oldNumber: number | null;
  newNumber: number | null;
}

export function lineDiff(before: string, after: string): DiffLine[] {
  const old = splitLines(before);
  const now = splitLines(after);
  const table = commonLengths(old, now);
  const lines: DiffLine[] = [];
  let oldIndex = 0;
  let newIndex = 0;
  const texts = { table, old, now };
  while (oldIndex < old.length || newIndex < now.length) {
    const kind = nextKind(texts, oldIndex, newIndex);
    lines.push({
      kind,
      text: kind === 'add' ? (now[newIndex] ?? '') : (old[oldIndex] ?? ''),
      oldNumber: kind === 'add' ? null : oldIndex + 1,
      newNumber: kind === 'del' ? null : newIndex + 1,
    });
    oldIndex += kind === 'add' ? 0 : 1;
    newIndex += kind === 'del' ? 0 : 1;
  }
  return lines;
}

interface DiffTexts {
  table: number[][];
  old: readonly string[];
  now: readonly string[];
}

function nextKind(
  { table, old, now }: DiffTexts,
  oldIndex: number,
  newIndex: number,
): DiffLine['kind'] {
  if (newIndex >= now.length) {
    return 'del';
  }
  if (oldIndex >= old.length) {
    return 'add';
  }
  if (old[oldIndex] === now[newIndex]) {
    return 'same';
  }
  const skipOld = table[oldIndex + 1]?.[newIndex] ?? 0;
  const skipNew = table[oldIndex]?.[newIndex + 1] ?? 0;
  return skipOld >= skipNew ? 'del' : 'add';
}

// table[i][j] — длина общей подпоследовательности хвостов old[i..] и now[j..].
function commonLengths(old: readonly string[], now: readonly string[]): number[][] {
  const table = Array.from({ length: old.length + 1 }, () =>
    new Array<number>(now.length + 1).fill(0),
  );
  for (let oldIndex = old.length - 1; oldIndex >= 0; oldIndex -= 1) {
    const row = table[oldIndex] ?? [];
    const below = table[oldIndex + 1] ?? [];
    for (let newIndex = now.length - 1; newIndex >= 0; newIndex -= 1) {
      row[newIndex] =
        old[oldIndex] === now[newIndex]
          ? (below[newIndex + 1] ?? 0) + 1
          : Math.max(below[newIndex] ?? 0, row[newIndex + 1] ?? 0);
    }
  }
  return table;
}

// Перевод строки в конце файла — не отдельная пустая строка.
function splitLines(text: string): string[] {
  if (text === '') {
    return [];
  }
  return text.replace(/\n$/, '').split('\n');
}

export function countChanges(lines: readonly DiffLine[]): { added: number; removed: number } {
  return {
    added: lines.filter((line) => line.kind === 'add').length,
    removed: lines.filter((line) => line.kind === 'del').length,
  };
}

// Куски diff для показа: изменения и по context строк вокруг, остальное свёрнуто.
export type DiffHunk = { kind: 'lines'; lines: DiffLine[] } | { kind: 'skip'; count: number };

export function diffHunks(lines: readonly DiffLine[], context = 3): DiffHunk[] {
  const keep = lines.map((_line, index) =>
    lines
      .slice(Math.max(0, index - context), index + context + 1)
      .some((near) => near.kind !== 'same'),
  );
  const hunks: DiffHunk[] = [];
  lines.forEach((line, index) => {
    const last = hunks.at(-1);
    if (keep[index] === true) {
      if (last?.kind === 'lines') {
        last.lines.push(line);
      } else {
        hunks.push({ kind: 'lines', lines: [line] });
      }
    } else if (last?.kind === 'skip') {
      last.count += 1;
    } else {
      hunks.push({ kind: 'skip', count: 1 });
    }
  });
  return hunks;
}

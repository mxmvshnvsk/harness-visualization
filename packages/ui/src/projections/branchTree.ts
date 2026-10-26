// Семья веток (этап 9): исходная сессия и все ветки от неё, ветки от веток — деревом.
// Строится по списку трейсов: у трейса-ветки есть branch.sourceFile — ссылка на родителя.

import type { TraceSummary } from '@harness-visualization/server';

export interface BranchNode {
  trace: TraceSummary;
  depth: number;
  // Родитель в этой семье; null — корень (исходная сессия).
  parentFile: string | null;
}

// Корень семьи: поднимаемся по ссылкам на родителя, пока родитель есть в списке.
export function rootOf(traces: readonly TraceSummary[], file: string): string {
  const byFile = new Map(traces.map((trace) => [trace.file, trace]));
  let current = file;
  const seen = new Set<string>();
  for (;;) {
    const parent = byFile.get(current)?.branch?.sourceFile;
    if (parent === undefined || !byFile.has(parent) || seen.has(parent)) {
      return current;
    }
    seen.add(current);
    current = parent;
  }
}

// Семья от корня: родитель, под ним его ветки по времени, под каждой — её ветки.
export function branchFamily(traces: readonly TraceSummary[], file: string): BranchNode[] {
  const root = traces.find((trace) => trace.file === rootOf(traces, file));
  if (root === undefined) {
    return [];
  }
  const children = childrenByParent(traces);
  const nodes: BranchNode[] = [];
  const visit = (trace: TraceSummary, depth: number, parentFile: string | null): void => {
    nodes.push({ trace, depth, parentFile });
    for (const child of children.get(trace.file) ?? []) {
      visit(child, depth + 1, trace.file);
    }
  };
  visit(root, 0, null);
  return nodes;
}

// Список трейсов с ветками под родителями — для «Сессии и трейсы». Порядок корней — как в списке.
export function nestBranches(traces: readonly TraceSummary[]): BranchNode[] {
  const files = new Set(traces.map((trace) => trace.file));
  const roots = traces.filter(
    (trace) => trace.branch === null || !files.has(trace.branch.sourceFile),
  );
  const seen = new Set<string>();
  return roots.flatMap((root) =>
    branchFamily(traces, root.file).filter((node) => {
      const fresh = !seen.has(node.trace.file);
      seen.add(node.trace.file);
      return fresh;
    }),
  );
}

function childrenByParent(traces: readonly TraceSummary[]): Map<string, TraceSummary[]> {
  const children = new Map<string, TraceSummary[]>();
  for (const trace of traces) {
    const parent = trace.branch?.sourceFile;
    if (parent !== undefined) {
      children.set(parent, [...(children.get(parent) ?? []), trace]);
    }
  }
  for (const list of children.values()) {
    list.sort((left, right) => (left.startedAt ?? '').localeCompare(right.startedAt ?? ''));
  }
  return children;
}

// Абзацы ответа, которых нет в другом ответе, — для подсветки разницы.
export function paragraphsOf(text: string): string[] {
  return text
    .split(/\n\s*\n/u)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== '');
}

// Модель почти никогда не повторяет абзац слово в слово — поэтому «такой же абзац» значит
// «больше половины слов совпадает» с каким-нибудь абзацем другого ответа. Подсвечиваются
// абзацы, у которых такой пары нет: новое по смыслу, а не другие слова.
export const SAME_PARAGRAPH = 0.5;

export function uniqueParagraphs(text: string, other: string): Set<string> {
  const others = paragraphsOf(other).map(wordsOf);
  return new Set(
    paragraphsOf(text).filter((paragraph) => {
      const words = wordsOf(paragraph);
      return !others.some((candidate) => overlap(words, candidate) >= SAME_PARAGRAPH);
    }),
  );
}

function wordsOf(paragraph: string): Set<string> {
  return new Set(
    paragraph
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length > 2),
  );
}

// Доля общих слов от меньшего из двух абзацев: короткий абзац внутри длинного — тот же.
function overlap(left: Set<string>, right: Set<string>): number {
  const smaller = Math.min(left.size, right.size);
  if (smaller === 0) {
    return left.size === right.size ? 1 : 0;
  }
  return [...left].filter((word) => right.has(word)).length / smaller;
}

// Где в тексте prompt скиллы и память — для разбивки бюджета (этап 6b). Харнесс сам пишет эти
// куски (skills/skillPrompt.ts, memory/memoryPrompt.ts, context/restoreAfterCompaction.ts), поэтому
// узнаёт их по своим же пометкам: каталог скиллов, блоки «[Скилл …] … [Конец скилла …]»,
// раздел памяти и memo, возвращённый после компакции.

const SKILL_PATTERNS = [
  /Скиллы — инструкции для отдельных задач\.[^\n]*(?:\n- [^\n]*)*/g,
  /\[Скилл [a-z0-9-]+ — [^\]\n]*\][\s\S]*?\[Конец скилла [a-z0-9-]+\]/g,
];

const MEMORY_PATTERNS = [
  /Память — папка \/memories[\s\S]*?(?:\[Конец \/memories\/memo\.md\]|\/memories\/memo\.md пока пуст\.)/g,
  /\/memories\/memo\.md сейчас:\n[\s\S]*?(?=\n\n(?:План \(|\[Скилл )|$)/g,
];

// Тулы, чьи результаты — тоже скиллы и память, а не обычные результаты тулов.
export const SKILL_TOOLS: ReadonlySet<string> = new Set(['load_skill', 'read_skill_file']);
export const MEMORY_TOOLS: ReadonlySet<string> = new Set(['memory']);

export interface MarkedCharacters {
  skills: number;
  memory: number;
}

export function markedCharacters(text: string): MarkedCharacters {
  return {
    skills: matchedLength(text, SKILL_PATTERNS),
    memory: matchedLength(text, MEMORY_PATTERNS),
  };
}

function matchedLength(text: string, patterns: readonly RegExp[]): number {
  let length = 0;
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      length += match[0].length;
    }
  }
  return length;
}

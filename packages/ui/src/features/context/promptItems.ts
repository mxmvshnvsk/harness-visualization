// Содержимое prompt одного запроса для экрана «Контекст»: описания тулов и сообщения по порядку,
// у каждого — часть бюджета, оценка токенов (та же формула, что у харнесса: символы JSON ÷
// charsPerToken) и что с ним случилось: новое с прошлого запроса, заглушка вместо убранного
// результата, сводка компакции, обрезанный результат. Префиксы — из packages/harness/src/context.

export type PromptPart = 'system' | 'skills' | 'memory' | 'tools' | 'dialog' | 'toolResults';

export type PromptMark = 'new' | 'stub' | 'summary' | 'truncated';

export interface PromptItem {
  part: PromptPart;
  // role сообщения или «tools» для описаний тулов.
  label: string;
  text: string;
  tokens: number;
  marks: PromptMark[];
}

const STUB_PREFIX = '[Результат удалён харнессом';
const SUMMARY_PREFIX = '[Сводка предыдущей части диалога';
const TRUNCATION_MARKER = '[Харнесс обрезал результат';

export function promptContents(
  body: Record<string, unknown>,
  charsPerToken: number,
  previous: Record<string, unknown> | null,
): PromptItem[] {
  const seen = new Set(asArray(previous?.messages).map((message) => JSON.stringify(message)));
  const tokensOf = (value: unknown): number =>
    Math.round(JSON.stringify(value).length / charsPerToken);
  const tools = asArray(body.tools);
  const items: PromptItem[] = [];
  if (tools.length > 0) {
    items.push({
      part: 'tools',
      label: 'tools',
      text: tools.map(toolName).join(', '),
      tokens: tokensOf(tools),
      marks: [],
    });
  }
  const messages = asArray(body.messages);
  const toolNames = toolNamesById(messages);
  for (const message of messages) {
    const record = asRecord(message);
    const role = typeof record.role === 'string' ? record.role : '?';
    const text = messageText(record);
    const toolName =
      typeof record.tool_call_id === 'string' ? (toolNames.get(record.tool_call_id) ?? null) : null;
    const item: PromptItem = {
      part: partOf(role, toolName),
      label: toolName === null ? role : `tool · ${toolName}`,
      text,
      tokens: tokensOf(message),
      marks: marksOf(text, previous !== null && !seen.has(JSON.stringify(message))),
    };
    items.push(...(role === 'system' ? splitSystem(item) : [item]));
  }
  return items;
}

// Каталог скиллов, инструкции always и раздел памяти — по пометкам харнесса, те же, что
// в packages/harness/src/context/promptMarkers.ts. Найденное — отдельными строками.
const SYSTEM_SECTIONS = [
  {
    part: 'skills',
    label: 'system · скиллы',
    pattern:
      /Скиллы — инструкции для отдельных задач\.[^\n]*(?:\n- [^\n]*)*|\[Скилл [a-z0-9-]+ — [^\]\n]*\][\s\S]*?\[Конец скилла [a-z0-9-]+\]/g,
  },
  {
    part: 'memory',
    label: 'system · память',
    pattern:
      /Память — папка \/memories[\s\S]*?(?:\[Конец \/memories\/memo\.md\]|\/memories\/memo\.md пока пуст\.)/g,
  },
] as const;

// System prompt одним сообщением, но у него три части бюджета: сам system, скиллы и память.
// Токены делятся пропорционально доле текста, как в оценке харнесса.
function splitSystem(item: PromptItem): PromptItem[] {
  const sections = SYSTEM_SECTIONS.map((section) => ({
    ...section,
    text: [...item.text.matchAll(section.pattern)].map((match) => match[0]).join('\n\n'),
  })).filter((section) => section.text !== '');
  if (sections.length === 0 || item.text.length === 0) {
    return [item];
  }
  const share = (text: string): number =>
    Math.round((item.tokens * text.length) / item.text.length);
  const rest = sections.reduce(
    (text, section) => text.replace(section.pattern, '').trim(),
    item.text,
  );
  return [
    {
      ...item,
      text: rest,
      tokens: item.tokens - sections.reduce((sum, section) => sum + share(section.text), 0),
    },
    ...sections.map((section) => ({
      ...item,
      part: section.part,
      label: section.label,
      text: section.text,
      tokens: share(section.text),
    })),
  ];
}

function marksOf(text: string, isNew: boolean): PromptMark[] {
  const marks: PromptMark[] = isNew ? ['new'] : [];
  if (text.startsWith(STUB_PREFIX)) {
    marks.push('stub');
  }
  if (text.startsWith(SUMMARY_PREFIX)) {
    marks.push('summary');
  }
  if (text.includes(TRUNCATION_MARKER)) {
    marks.push('truncated');
  }
  return marks;
}

// Результаты тулов скиллов и памяти — свои части, как в бюджете харнесса (promptBudget.ts).
function partOf(role: string, toolName: string | null): PromptPart {
  if (role === 'system') {
    return 'system';
  }
  if (role !== 'tool') {
    return 'dialog';
  }
  if (toolName === 'load_skill' || toolName === 'read_skill_file') {
    return 'skills';
  }
  return toolName === 'memory' ? 'memory' : 'toolResults';
}

function toolNamesById(messages: unknown[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const message of messages) {
    for (const call of asArray(asRecord(message).tool_calls)) {
      const record = asRecord(call);
      const name = asRecord(record.function).name;
      if (typeof record.id === 'string' && typeof name === 'string') {
        names.set(record.id, name);
      }
    }
  }
  return names;
}

function messageText(message: Record<string, unknown>): string {
  const content = typeof message.content === 'string' ? message.content : '';
  const calls = asArray(message.tool_calls).map((call) => {
    const fn = asRecord(asRecord(call).function);
    const name = typeof fn.name === 'string' ? fn.name : '?';
    const args = typeof fn.arguments === 'string' ? fn.arguments : '';
    return `tool_call ${name} ${args}`.trim();
  });
  return [content, ...calls].filter((part) => part !== '').join('\n') || '(пусто)';
}

function toolName(tool: unknown): string {
  const name = asRecord(asRecord(tool).function).name;
  return typeof name === 'string' ? name : '?';
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? (value as unknown[]) : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

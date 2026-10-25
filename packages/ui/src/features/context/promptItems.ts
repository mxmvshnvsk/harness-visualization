// Содержимое prompt одного запроса для экрана «Контекст»: описания тулов и сообщения по порядку,
// у каждого — часть бюджета, оценка токенов (та же формула, что у харнесса: символы JSON ÷
// charsPerToken) и что с ним случилось: новое с прошлого запроса, заглушка вместо убранного
// результата, сводка компакции, обрезанный результат. Префиксы — из packages/harness/src/context.

export type PromptPart = 'system' | 'tools' | 'dialog' | 'toolResults';

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
  for (const message of asArray(body.messages)) {
    const record = asRecord(message);
    const role = typeof record.role === 'string' ? record.role : '?';
    const text = messageText(record);
    items.push({
      part: partOf(role),
      label: role,
      text,
      tokens: tokensOf(message),
      marks: marksOf(text, previous !== null && !seen.has(JSON.stringify(message))),
    });
  }
  return items;
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

function partOf(role: string): PromptPart {
  if (role === 'system') {
    return 'system';
  }
  return role === 'tool' ? 'toolResults' : 'dialog';
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

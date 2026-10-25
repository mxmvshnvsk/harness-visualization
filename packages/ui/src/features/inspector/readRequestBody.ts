// Что ушло в модель: messages и описания tools из тела запроса (формат OpenAI-совместимого API —
// его отправляет харнесс, docs/events.md). Тело в событии — unknown для типов, поэтому разбираем
// осторожно: чего нет или что не того вида — пропускаем, а не падаем.

export interface RequestMessage {
  role: string;
  // Текст сообщения; у assistant с tool_calls его может не быть.
  content: string | null;
  // Каких тулов просит assistant: «имя аргументы».
  toolCalls: string[];
  // У role: tool — на какой вызов это ответ.
  toolCallId: string | null;
}

export interface RequestBody {
  messages: RequestMessage[];
  toolNames: string[];
}

export function readRequestBody(body: Record<string, unknown>): RequestBody {
  return {
    messages: asArray(body.messages).map(readMessage),
    toolNames: asArray(body.tools).flatMap(readToolName),
  };
}

function readMessage(value: unknown): RequestMessage {
  const message = asRecord(value);
  return {
    role: asString(message.role) ?? '?',
    content: asString(message.content),
    toolCalls: asArray(message.tool_calls).map((call) => {
      const fn = asRecord(asRecord(call).function);
      return `${asString(fn.name) ?? '?'} ${asString(fn.arguments) ?? ''}`.trim();
    }),
    toolCallId: asString(message.tool_call_id),
  };
}

function readToolName(value: unknown): string[] {
  const name = asString(asRecord(asRecord(value).function).name);
  return name === null ? [] : [name];
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? (value as unknown[]) : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

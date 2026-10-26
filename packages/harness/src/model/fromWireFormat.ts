// Обратный перевод: сообщения из тела запроса к модели (формат API, как в трейсе) — в наш
// нейтральный формат. Нужен ветке (этап 9): история шага N берётся ровно такой, какой её
// получила модель, — из тела model_request этого шага.

import { z } from 'zod';
import type { ChatMessage } from './chatTypes.js';

const wireToolCallSchema = z.object({
  id: z.string(),
  function: z.object({ name: z.string(), arguments: z.string() }),
});

const wireMessageSchema = z.discriminatedUnion('role', [
  z.object({ role: z.literal('system'), content: z.string() }),
  z.object({ role: z.literal('user'), content: z.string() }),
  z.object({
    role: z.literal('assistant'),
    content: z.string().nullable(),
    reasoning_content: z.string().nullable().optional(),
    tool_calls: z.array(wireToolCallSchema).optional(),
  }),
  z.object({ role: z.literal('tool'), tool_call_id: z.string(), content: z.string() }),
]);

const wireBodySchema = z.object({ messages: z.array(wireMessageSchema) });

export function fromWireMessages(body: unknown): ChatMessage[] {
  const parsed = wireBodySchema.safeParse(body);
  if (!parsed.success) {
    throw new Error(`Тело запроса к модели не разобралось: ${parsed.error.message}`);
  }
  return parsed.data.messages.map((message): ChatMessage => {
    switch (message.role) {
      case 'assistant':
        return {
          role: 'assistant',
          content: message.content,
          reasoningContent: message.reasoning_content ?? null,
          toolCalls: (message.tool_calls ?? []).map((call) => ({
            id: call.id,
            name: call.function.name,
            argumentsText: call.function.arguments,
          })),
        };
      case 'tool':
        return { role: 'tool', toolCallId: message.tool_call_id, content: message.content };
      default:
        return message;
    }
  });
}

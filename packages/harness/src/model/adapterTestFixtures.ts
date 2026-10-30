// Транспорт этих проверок создаёт Response в памяти. Ни .env, ни настоящие
// ключи, ни сетевые соединения для контрактных примеров не используются.
import { readFile } from 'node:fs/promises';
import {
  harnessSettingsSchema,
  type HarnessSettings,
  type ModelSettings,
} from '../settings/settingsSchema.js';
import { resolveRegistryModels } from '../settings/modelRegistry.js';

const SETTINGS = harnessSettingsSchema.parse(
  JSON.parse(await readFile(new URL('../../../../harness.config.json', import.meta.url), 'utf8')),
);

export function adapterSettings(): HarnessSettings {
  return structuredClone(SETTINGS);
}

export function adapterModel(key: string): ModelSettings {
  const registered = resolveRegistryModels(adapterSettings()).find((model) => model.key === key);
  if (registered === undefined) {
    throw new Error(`В тестовом реестре нет модели ${key}`);
  }
  return registered.settings;
}

interface CompletionFixture {
  id: string;
  model: string;
  choices: unknown[];
  usage: Record<string, unknown>;
}

export function completionBody(
  model: string,
  usage: Record<string, unknown> = {},
): CompletionFixture {
  return {
    id: 'mock-response',
    model,
    choices: [
      { index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'Ответ 🧪' } },
    ],
    usage: { prompt_tokens: 100, completion_tokens: 20, ...usage },
  };
}

export function fragmentedSse(events: unknown[], done = true): Response {
  const lines = events.map((event) => `data: ${JSON.stringify(event)}\r\n\r\n`);
  return fragmentedSseText(
    ': keepalive\r\n\r\n' + lines.join('') + (done ? 'data: [DONE]\r\n\r\n' : ''),
  );
}

export function fragmentedSseText(text: string): Response {
  const bytes = new TextEncoder().encode(text);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Три байта разрезают четырёхбайтный emoji и часть кириллицы посреди символа.
      for (let offset = 0; offset < bytes.length; offset += 3) {
        controller.enqueue(bytes.slice(offset, offset + 3));
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { 'content-type': 'text/event-stream; charset=utf-8' } });
}

export function completionEvents(body: ReturnType<typeof completionBody>): unknown[] {
  return [
    { id: body.id, model: body.model, choices: [{ delta: { content: 'Ответ ' } }] },
    { choices: [{ delta: { content: '🧪' }, finish_reason: 'stop' }] },
    { choices: [], usage: body.usage },
  ];
}

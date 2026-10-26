import { describe, expect, it } from 'vitest';
import { convertImported, detectImportFormat } from '@harness-visualization/harness/adapters';
import type { HarnessEvent } from '@harness-visualization/harness';

// Синтетический экспорт OpenCode 2.x: вопрос, ответ с рассуждением и тулом (тул выполнен
// внутри ответа), финальный текст, конец хода.
const T0 = Date.UTC(2026, 9, 26, 10, 0, 0);
const exported = {
  info: {
    id: 'ses_abcdef123456',
    model: { id: 'deepseek/flash', providerID: 'openrouter', variant: 'high' },
    cost: 0.003,
    time: { created: T0 },
  },
  messages: [
    {
      id: 'msg_u1',
      type: 'user',
      text: 'Найди ключ в /Users/alice/app',
      time: { created: T0 + 10 },
    },
    {
      id: 'msg_a1',
      type: 'assistant',
      time: { created: T0 + 20, streamed: T0 + 900, completed: T0 + 1500 },
      model: { id: 'deepseek/flash', providerID: 'openrouter', variant: 'high' },
      finish: 'tool-calls',
      cost: 0.001,
      tokens: { input: 100, output: 20, reasoning: 5, cache: { read: 900, write: 0 } },
      content: [
        { type: 'reasoning', text: 'посмотрю файлы' },
        {
          type: 'tool',
          id: 'call_1',
          name: 'grep',
          state: {
            status: 'completed',
            input: { pattern: 'API_KEY' },
            content: [{ type: 'text', text: '.env: API_KEY=sk-abcdefghijklmnopqrstuv' }],
            metadata: { matches: 1 },
          },
          time: { created: T0 + 800, ran: T0 + 1000, completed: T0 + 1200 },
        },
      ],
    },
    {
      id: 'msg_a2',
      type: 'assistant',
      time: { created: T0 + 1600, streamed: T0 + 2000, completed: T0 + 2500 },
      finish: 'stop',
      cost: 0.002,
      tokens: { input: 50, output: 40, reasoning: 0, cache: { read: 1000, write: 0 } },
      content: [{ type: 'text', text: 'Ключ в .env.' }],
    },
    { id: 'msg_i1', type: 'idle', outcome: 'succeeded', time: { created: T0 + 2600 } },
  ],
};

function ofType<T extends HarnessEvent['type']>(events: HarnessEvent[], type: T) {
  return events.filter((event): event is Extract<HarnessEvent, { type: T }> => event.type === type);
}

describe('OpenCode', () => {
  const text = JSON.stringify(exported);
  const events = convertImported(text, 'auto');

  it('формат определяется по содержимому', () => {
    expect(detectImportFormat(text)).toBe('opencode');
    expect(detectImportFormat('{"type":"user","sessionId":"x","message":{}}\n')).toBe(
      'claude-code',
    );
  });

  it('ответ модели: рассуждение, тул и токены; кэш — попадания', () => {
    const response = ofType(events, 'model_response')[0];
    expect(response?.reply.reasoningText).toBe('посмотрю файлы');
    expect(response?.reply.toolCalls.map((call) => call.name)).toEqual(['grep']);
    expect(response?.reply.usage).toMatchObject({ inputTokens: 1000, inputCacheHitTokens: 900 });
    expect(response?.cost?.total).toBe(0.001);
  });

  it('тул — после ответа и по порядку; результат из блока тула', () => {
    const order = events.map((event) => event.type);
    expect(order.indexOf('tool_call')).toBeGreaterThan(order.indexOf('model_response'));
    expect(ofType(events, 'tool_result')[0]).toMatchObject({
      toolName: 'grep',
      status: 'success',
      durationMs: 200,
    });
    expect(ofType(events, 'assistant_message')[0]?.text).toBe('Ключ в .env.');
  });

  it('маскирует ключи и домашнюю папку; цена сессии — от OpenCode', () => {
    const json = JSON.stringify(events);
    expect(json).not.toContain('sk-abcdef');
    expect(json).not.toContain('/Users/alice');
    const finished = ofType(events, 'session_finished')[0];
    expect(finished?.modelCost).toEqual({ currency: 'USD', total: 0.003 });
    expect(ofType(events, 'session_started')[0]?.importedFrom?.harness).toBe('OpenCode');
  });
});

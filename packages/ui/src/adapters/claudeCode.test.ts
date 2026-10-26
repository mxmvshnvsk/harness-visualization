import { describe, expect, it } from 'vitest';
import { convertClaudeCode } from '@harness-visualization/harness/adapters';
import type { HarnessEvent } from '@harness-visualization/harness';

// Маленькая синтетическая запись Claude Code: вопрос, ответ из трёх блоков (thinking, text,
// tool_use), результат тула между блоками ответа, компакция, субагент и финальный ответ.
const SESSION = 'abcdef12-0000-0000-0000-000000000000';
const usage = {
  input_tokens: 10,
  cache_read_input_tokens: 1000,
  cache_creation_input_tokens: 90,
  output_tokens: 50,
  output_tokens_details: { thinking_tokens: 20 },
};

function line(time: number, entry: Record<string, unknown>): string {
  return JSON.stringify({
    sessionId: SESSION,
    version: '2.1.0',
    timestamp: new Date(Date.UTC(2026, 9, 26, 10, 0, time)).toISOString(),
    isSidechain: false,
    ...entry,
  });
}

function assistant(time: number, id: string, block: unknown, stop: string | null): string {
  return line(time, {
    type: 'assistant',
    message: {
      id,
      model: 'claude-test',
      role: 'assistant',
      stop_reason: stop,
      content: [block],
      usage,
    },
  });
}

const transcript = [
  JSON.stringify({ type: 'mode', mode: 'default' }),
  line(0, { type: 'user', message: { role: 'user', content: 'Прочитай /Users/alice/app/.env' } }),
  assistant(1, 'msg_1', { type: 'thinking', thinking: 'надо прочитать' }, null),
  assistant(
    2,
    'msg_1',
    { type: 'tool_use', id: 'tu_1', name: 'Read', input: { path: '.env' } },
    null,
  ),
  line(3, {
    type: 'user',
    message: {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'tu_1',
          content: 'API_KEY=sk-abcdefghijklmnopqrstuvwx',
        },
      ],
    },
  }),
  assistant(
    4,
    'msg_1',
    { type: 'tool_use', id: 'tu_2', name: 'Bash', input: { command: 'false' } },
    'tool_use',
  ),
  line(5, {
    type: 'user',
    message: {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'tu_2',
          content: [{ type: 'text', text: 'exit 1' }],
          is_error: true,
        },
      ],
    },
  }),
  line(6, {
    type: 'system',
    subtype: 'compact_boundary',
    compactMetadata: { preTokens: 900, postTokens: 100 },
  }),
  line(6, {
    type: 'user',
    isCompactSummary: true,
    message: { role: 'user', content: 'Сводка прошлого.' },
  }),
  line(7, {
    type: 'assistant',
    isSidechain: true,
    message: { id: 'msg_sub', content: [{ type: 'text', text: 'субагент' }] },
  }),
  assistant(8, 'msg_2', { type: 'text', text: 'Готово.' }, 'end_turn'),
  '{"оборванная строка',
].join('\n');

function ofType<T extends HarnessEvent['type']>(
  events: HarnessEvent[],
  type: T,
): Extract<HarnessEvent, { type: T }>[] {
  return events.filter((event): event is Extract<HarnessEvent, { type: T }> => event.type === type);
}

describe('convertClaudeCode', () => {
  const events = convertClaudeCode(transcript);

  it('собирает записи с одним message.id в один ответ модели', () => {
    const responses = ofType(events, 'model_response');
    expect(responses).toHaveLength(2);
    expect(responses[0]?.reply.reasoningText).toBe('надо прочитать');
    expect(responses[0]?.reply.toolCalls.map((call) => call.name)).toEqual(['Read', 'Bash']);
    expect(ofType(events, 'model_request').map((request) => request.iteration)).toEqual([1, 2]);
  });

  it('ставит результаты тулов после их вызовов', () => {
    const order = events.map((event) => event.type).filter((type) => type.startsWith('tool_'));
    expect(order).toEqual(['tool_call', 'tool_call', 'tool_result', 'tool_result']);
    const results = ofType(events, 'tool_result');
    expect(results.map((result) => [result.toolName, result.status])).toEqual([
      ['Read', 'success'],
      ['Bash', 'error'],
    ]);
  });

  it('переводит usage: кэш Anthropic — в попадания и промахи', () => {
    const finished = ofType(events, 'session_finished')[0];
    expect(finished?.usage).toEqual({
      inputTokens: 2200,
      inputCacheHitTokens: 2000,
      inputCacheMissTokens: 200,
      outputTokens: 100,
      reasoningTokens: 40,
    });
  });

  it('маскирует ключи и домашнюю папку', () => {
    const text = JSON.stringify(events);
    expect(text).not.toContain('sk-abcdef');
    expect(text).not.toContain('/Users/alice');
    expect(ofType(events, 'user_message')[0]?.text).toBe('Прочитай ~/app/.env');
  });

  it('переводит компакцию и пропускает субагента', () => {
    const compacted = ofType(events, 'history_compacted')[0];
    expect(compacted?.summary).toBe('Сводка прошлого.');
    expect(compacted?.beforeTokens).toBe(900);
    expect(text(events)).not.toContain('субагент"');
    const started = ofType(events, 'session_started')[0];
    expect(started?.importedFrom?.harness).toBe('Claude Code');
    expect(started?.importedFrom?.missing.some((item) => item.startsWith('субагенты'))).toBe(true);
    expect(ofType(events, 'assistant_message')[0]?.text).toBe('Готово.');
  });

  it('отказывается от файла не того формата', () => {
    expect(() => convertClaudeCode('{"type":"session_started"}')).toThrow(
      /не запись сессии Claude Code/,
    );
  });
});

function text(events: HarnessEvent[]): string {
  return JSON.stringify(events.filter((event) => event.type !== 'session_started'));
}

import { describe, expect, it } from 'vitest';
import { readRequestBody } from './readRequestBody';

describe('readRequestBody', () => {
  it('читает messages с tool_calls и ответами тулов, а также имена tools', () => {
    const body = readRequestBody({
      messages: [
        { role: 'system', content: 'Ты — ассистент' },
        { role: 'user', content: 'удалёнка' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            { id: 'c1', function: { name: 'kedr__search', arguments: '{"query":"x"}' } },
          ],
        },
        { role: 'tool', tool_call_id: 'c1', content: 'regulations/remoteWork' },
      ],
      tools: [{ type: 'function', function: { name: 'kedr__search' } }],
    });

    expect(body.messages.map((message) => message.role)).toEqual([
      'system',
      'user',
      'assistant',
      'tool',
    ]);
    expect(body.messages[2]?.toolCalls).toEqual(['kedr__search {"query":"x"}']);
    expect(body.messages[3]?.toolCallId).toBe('c1');
    expect(body.toolNames).toEqual(['kedr__search']);
  });

  it('не падает на теле другого вида', () => {
    expect(readRequestBody({ messages: 'не массив', tools: [42] })).toEqual({
      messages: [],
      toolNames: [],
    });
  });
});

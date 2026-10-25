import { describe, expect, it } from 'vitest';
import { promptContents } from './promptContents';

const tools = [{ type: 'function', function: { name: 'search_docs', parameters: {} } }];
const system = { role: 'system', content: 'Ты агент.' };
const question = { role: 'user', content: 'Сколько дней удалёнки?' };

describe('promptContents', () => {
  it('тулы, затем сообщения по порядку; новое помечено относительно прошлого запроса', () => {
    const previous = { tools, messages: [system, question] };
    const call = {
      role: 'assistant',
      content: null,
      tool_calls: [{ function: { name: 'search_docs', arguments: '{"q":"удалёнка"}' } }],
    };
    const result = { role: 'tool', content: 'Регламент… [Харнесс обрезал результат: …]' };
    const items = promptContents(
      { tools, messages: [system, question, call, result] },
      3,
      previous,
    );

    expect(items.map((item) => [item.part, item.label])).toEqual([
      ['tools', 'tools'],
      ['system', 'system'],
      ['dialog', 'user'],
      ['dialog', 'assistant'],
      ['toolResults', 'tool'],
    ]);
    expect(items[1]?.marks).toEqual([]);
    expect(items[3]?.text).toBe('tool_call search_docs {"q":"удалёнка"}');
    expect(items[3]?.marks).toEqual(['new']);
    expect(items[4]?.marks).toEqual(['new', 'truncated']);
    expect(items[0]?.text).toBe('search_docs');
  });

  it('заглушка и сводка узнаются по префиксам харнесса; у первого запроса «нового» нет', () => {
    const stub = { role: 'tool', content: '[Результат удалён харнессом, чтобы освободить место…]' };
    const summary = { role: 'user', content: '[Сводка предыдущей части диалога — …]' };
    const items = promptContents({ messages: [summary, stub] }, 3, null);

    expect(items.map((item) => item.marks)).toEqual([['summary'], ['stub']]);
  });
});

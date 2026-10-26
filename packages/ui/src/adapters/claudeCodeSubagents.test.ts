import { describe, expect, it } from 'vitest';
import { convertClaudeCode } from '@harness-visualization/harness/adapters';
import type { HarnessEvent } from '@harness-visualization/harness';
import { projectSubagents } from '../projections/projectSubagents';

// Субагент Claude Code 2.1: главный агент зовёт тул Agent, записи субагента лежат в отдельном
// файле subagents/agent-<id>.jsonl (isSidechain, agentId), результат тула Agent несёт
// toolUseResult.agentId. Форма — как в настоящей записи Claude Code 2.1.

const SESSION = 'abcdef12-0000-0000-0000-000000000000';
const usage = { input_tokens: 10, output_tokens: 5 };

function line(second: number, entry: Record<string, unknown>): string {
  return JSON.stringify({
    sessionId: SESSION,
    version: '2.1.0',
    isSidechain: false,
    timestamp: new Date(Date.UTC(2026, 9, 26, 10, 0, second)).toISOString(),
    ...entry,
  });
}

function assistant(second: number, id: string, block: unknown, extra = {}): string {
  return line(second, {
    type: 'assistant',
    message: { id, role: 'assistant', stop_reason: 'end_turn', content: [block], usage },
    ...extra,
  });
}

const sub = { isSidechain: true, agentId: 'a42' };

const main = [
  line(0, { type: 'user', message: { role: 'user', content: 'Найди баг' } }),
  assistant(1, 'msg_1', {
    type: 'tool_use',
    id: 'tu_agent',
    name: 'Agent',
    input: { subagent_type: 'general-purpose', prompt: 'Прочитай math.js' },
  }),
  line(6, {
    type: 'user',
    message: {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'tu_agent', content: 'отчёт отправлен' }],
    },
    toolUseResult: {
      status: 'completed',
      agentId: 'a42',
      agentType: 'general-purpose',
      handbackReport: { text: 'Баг в add: вычитание.' },
      totalDurationMs: 4000,
    },
  }),
  assistant(7, 'msg_2', { type: 'text', text: 'Баг в add.' }),
].join('\n');

const subagent = [
  line(2, { ...sub, type: 'user', message: { role: 'user', content: 'Прочитай math.js' } }),
  assistant(
    3,
    'msg_s1',
    { type: 'tool_use', id: 'tu_read', name: 'Read', input: { file_path: 'math.js' } },
    sub,
  ),
  line(4, {
    ...sub,
    type: 'user',
    message: {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'tu_read', content: '1\treturn a - b' }],
    },
  }),
  assistant(5, 'msg_s2', { type: 'text', text: 'Баг в add: вычитание.' }, sub),
].join('\n');

function types(events: readonly HarnessEvent[]): string[] {
  return events.map((event) => `${event.agentId === undefined ? '' : 'sub:'}${event.type}`);
}

describe('субагенты Claude Code', () => {
  it('записи субагента — между вызовом Agent и его результатом, с agentId', () => {
    const events = convertClaudeCode(`${main}\n${subagent}`);
    expect(types(events)).toEqual([
      'session_started',
      'user_message',
      'model_request',
      'model_response',
      'tool_call',
      'subagent_started',
      'sub:model_request',
      'sub:model_response',
      'sub:tool_call',
      'sub:tool_result',
      'sub:model_request',
      'sub:model_response',
      'sub:assistant_message',
      'subagent_finished',
      'tool_result',
      'model_request',
      'model_response',
      'assistant_message',
      'session_finished',
    ]);
    const [run] = projectSubagents(events);
    expect(run).toMatchObject({
      subagentId: 'a42',
      agent: 'general-purpose',
      task: 'Прочитай math.js',
      status: 'done',
      report: 'Баг в add: вычитание.',
      modelRequests: 2,
    });
  });

  it('история субагента начинается с поручения, шаги считаются заново', () => {
    const events = convertClaudeCode(`${main}\n${subagent}`);
    const subRequests = events.filter(
      (event) => event.type === 'model_request' && event.agentId === 'a42',
    );
    expect(
      subRequests.map((event) => (event.type === 'model_request' ? event.iteration : 0)),
    ).toEqual([1, 2]);
    const first = subRequests[0];
    expect(first?.type === 'model_request' ? first.body : null).toEqual({
      messages: [{ role: 'user', content: 'Прочитай math.js' }],
    });
  });

  it('без файла субагента — честная пометка и счётчик для кнопки «добавить»', () => {
    const events = convertClaudeCode(main);
    const started = events[0];
    const imported = started?.type === 'session_started' ? started.importedFrom : null;
    expect(imported?.subagentsWithoutRecord).toBe(1);
    expect(imported?.missing.some((item) => item.includes('subagents/'))).toBe(true);
    expect(types(events)).not.toContain('subagent_started');
  });
});

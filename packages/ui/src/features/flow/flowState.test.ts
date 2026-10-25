import { describe, expect, it } from 'vitest';
import {
  EventLog,
  modelRequest,
  modelResponse,
  sessionStarted,
  toolCall,
  toolCallEvent,
  toolResult,
  usage,
} from '../../projections/testEvents';
import { flowStateAt } from './flowState';

const context = { modelHost: 'api.deepseek.com' };
const search = toolCall('c1', 'kedr__search');

function session(): EventLog {
  return new EventLog()
    .add(sessionStarted())
    .add({ type: 'user_message', text: 'удалёнка' })
    .add(modelRequest('r1', 1))
    .add({
      type: 'network_request',
      host: 'api.deepseek.com',
      route: 'direct',
      viaProxy: false,
      rule: null,
      proxyUrl: null,
    })
    .add(modelResponse('r1', { usage: usage(900, 0), toolCalls: [search] }))
    .add(toolCallEvent(search))
    .add({
      type: 'mcp_message',
      serverName: 'kedr',
      direction: 'to_server',
      message: { method: 'tools/call' },
    })
    .add(toolResult(search));
}

describe('flowStateAt', () => {
  it('пока модель не ответила — она думает, а пакет запроса остаётся на схеме', () => {
    // Срез заканчивается сетевым запросом к модели: он пакета не даёт.
    const state = flowStateAt(session().events.slice(0, 4), context);

    expect(state.packet).toMatchObject({ from: 'harness', to: 'model', sequence: 3 });
    expect(state.waiting).toEqual([expect.objectContaining({ node: 'model', label: 'думает…' })]);
  });

  it('пока tool выполняется — ждём MCP-сервер', () => {
    const state = flowStateAt(session().events.slice(0, 7), context);

    expect(state.waiting).toEqual([
      expect.objectContaining({ node: 'mcp', label: 'выполняет kedr__search…' }),
    ]);
  });

  it('всё пришло — никто не ждёт', () => {
    const state = flowStateAt(session().events, context);

    expect(state.waiting).toEqual([]);
    expect(state.packet).toMatchObject({ from: 'mcp', to: 'harness' });
  });

  it('вопрос пользователю: ждём его, а не tool', () => {
    const remove = toolCall('c2', 'delete_file');
    const log = new EventLog().add(sessionStarted()).add(toolCallEvent(remove)).add({
      type: 'permission_requested',
      toolCallId: remove.id,
      toolName: remove.name,
      actionDescription: 'Удалить файл',
    });

    expect(flowStateAt(log.events, context).waiting).toEqual([
      expect.objectContaining({ node: 'user', label: 'ждём ответа…' }),
    ]);
  });
});

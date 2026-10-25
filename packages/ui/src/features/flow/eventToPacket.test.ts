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
import { countFlow } from './flowCounters';
import { eventToPacket, modelHostOf } from './eventToPacket';

const context = { modelHost: 'api.deepseek.com' };

function session(): EventLog {
  const search = toolCall('c1', 'kedr__search', '{"query":"удалёнка"}');
  const web = toolCall('c2', 'web_search', '{"query":"node lts"}');
  return new EventLog()
    .add(sessionStarted())
    .add({ type: 'user_message', text: 'удалёнка' })
    .add(modelRequest('r1', 1))
    .add({
      type: 'network_request',
      host: 'api.deepseek.com',
      route: 'proxy',
      viaProxy: false,
      rule: null,
      proxyUrl: null,
    })
    .add(modelResponse('r1', { usage: usage(1963, 1792), toolCalls: [search, web] }))
    .add(toolCallEvent(search))
    .add(toolResult(search))
    .add(toolCallEvent(web))
    .add({
      type: 'network_request',
      host: 'searchapi.api.cloud.yandex.net',
      route: 'direct',
      viaProxy: false,
      rule: 'Яндекс напрямую',
      proxyUrl: null,
    })
    .add(toolResult(web, 'success', 0.488))
    .add({ type: 'assistant_message', text: 'До трёх дней.' });
}

describe('eventToPacket', () => {
  it('ведёт пакеты между участниками по смыслу события', () => {
    const routes = session()
      .events.map((event) => eventToPacket(event, context))
      .filter((packet) => packet !== null)
      .map((packet) => `${packet.from}→${packet.to}`);

    expect(routes).toEqual([
      'user→harness',
      'harness→model',
      'model→harness',
      'harness→mcp',
      'mcp→harness',
      'harness→tools',
      'tools→network',
      'tools→harness',
      'harness→user',
    ]);
  });

  it('запрос к хосту модели не дублирует пакет model_request', () => {
    const network = session().events[3];
    expect(network?.type).toBe('network_request');
    if (network !== undefined) {
      expect(eventToPacket(network, context)).toBeNull();
    }
  });

  it('отказ по тайм-ауту — внутри харнесса, пользователь не отвечал', () => {
    const [event] = new EventLog().add({
      type: 'permission_resolved',
      toolCallId: 'c',
      toolName: 'delete_file',
      approved: false,
      answeredBy: 'timeout',
      waitedForUserMs: 120000,
    }).events;

    expect(event === undefined ? null : eventToPacket(event, context)).toMatchObject({
      from: 'harness',
      to: 'harness',
      label: 'отказ: timeout',
    });
  });

  it('сетевой запрос подписан доменом и маршрутом', () => {
    const network = session().events[8];
    expect(network === undefined ? null : eventToPacket(network, context)?.label).toBe(
      'yandex.net · напрямую',
    );
  });

  it('хост модели берётся из session_started', () => {
    expect(modelHostOf(session().events)).toBe('api.deepseek.com');
  });
});

describe('countFlow', () => {
  it('считает, что прошло через каждого участника', () => {
    const counters = countFlow(session().events, context);

    expect(counters.model).toBe('1 запрос · input 1 963');
    expect(counters.mcp).toBe('1 вызов');
    expect(counters.tools).toBe('1 вызов');
    expect(counters.network).toBe('1 запрос');
  });
});

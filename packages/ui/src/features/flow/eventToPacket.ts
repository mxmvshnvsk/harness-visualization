// Какой пакет показать на схеме для события: откуда, куда и с какой подписью.
// from === to — событие внутри участника (харнесс собрал prompt, политика приняла решение):
// узел вспыхивает, пакет никуда не летит. null — событие на схеме не показываем.

import type { HarnessEvent, HarnessEventType } from '@harness-visualization/harness';
import { eventGroup, type EventGroup } from '../../events/eventGroups';
import type { EventOfType } from '../../events/eventTypes';
import type { FlowNodeId } from './flowGraph';

export interface Packet {
  from: FlowNodeId;
  to: FlowNodeId;
  label: string;
  group: EventGroup;
}

export interface FlowContext {
  // Хост модели (из session_started): его network_request уже показан пакетом model_request.
  modelHost: string | null;
}

// Тулы MCP-серверов харнесс называет «сервер__тул» (kedr__search).
export function isMcpTool(toolName: string): boolean {
  return toolName.includes('__');
}

export function eventToPacket(event: HarnessEvent, context: FlowContext): Packet | null {
  const route = routeOf(event, context);
  return route === null ? null : { ...route, group: eventGroup(event.type) };
}

type Route = Omit<Packet, 'group'>;

type Routes = {
  [Type in HarnessEventType]?: (event: EventOfType<Type>, context: FlowContext) => Route | null;
};

// Таблица по типам событий; типа нет в таблице — событие на схеме не показываем.
const ROUTES: Routes = {
  user_message: () => ({ from: 'user', to: 'harness', label: 'вопрос' }),
  assistant_message: () => ({ from: 'harness', to: 'user', label: 'ответ' }),
  prompt_assembled: (event) => ({
    from: 'harness',
    to: 'harness',
    label: `prompt: ${String(event.messages.length)} messages`,
  }),
  model_request: (event) => ({ from: 'harness', to: 'model', label: `prompt · ${event.purpose}` }),
  model_response: (event) => ({ from: 'model', to: 'harness', label: describeReply(event) }),
  model_error: () => ({ from: 'model', to: 'harness', label: 'ошибка' }),
  tool_call: (event) => ({ from: 'harness', to: toolNode(event.toolName), label: event.toolName }),
  tool_result: (event) => ({
    from: toolNode(event.toolName),
    to: 'harness',
    label: `${event.toolName}: ${event.status}`,
  }),
  permission_evaluated: (event) => ({
    from: 'harness',
    to: 'harness',
    label: `политика: ${event.decision}`,
  }),
  permission_requested: () => ({ from: 'harness', to: 'user', label: 'разрешить?' }),
  // Ответил не пользователь (тайм-аут, спросить некого) — отказ рождается внутри харнесса.
  permission_resolved: (event) =>
    event.answeredBy === 'user'
      ? { from: 'user', to: 'harness', label: event.approved ? 'да' : 'нет' }
      : { from: 'harness', to: 'harness', label: `отказ: ${event.answeredBy}` },
  context_retrieved: (event) => ({
    from: 'mcp',
    to: 'harness',
    label: `подмешано: ${event.toolName}`,
  }),
  query_rewritten: (event) => ({ from: 'harness', to: 'harness', label: `query: ${event.query}` }),
  mcp_message: (event) =>
    event.direction === 'to_server'
      ? { from: 'harness', to: 'mcp', label: 'JSON-RPC' }
      : { from: 'mcp', to: 'harness', label: 'JSON-RPC' },
  mcp_server_ready: (event) => ({ from: 'mcp', to: 'mcp', label: `${event.serverName}: готов` }),
  network_request: (event, context) =>
    event.host === context.modelHost
      ? null
      : {
          from: 'tools',
          to: 'network',
          label: `${shortHost(event.host)} · ${event.viaProxy ? 'прокси' : 'напрямую'}`,
        },
  claim_judged: (event) => ({
    from: 'model',
    to: 'harness',
    label: `claim ${String(event.claimNumber)}: ${event.verdict}`,
  }),
  error: () => ({ from: 'harness', to: 'harness', label: 'ошибка' }),
};

function routeOf(event: HarnessEvent, context: FlowContext): Route | null {
  // TypeScript не связывает тип события с ключом таблицы сам — помогаем приведением.
  const route = ROUTES[event.type] as
    ((event: HarnessEvent, context: FlowContext) => Route | null) | undefined;
  return route === undefined ? null : route(event, context);
}

function describeReply(event: EventOfType<'model_response'>): string {
  const count = event.reply.toolCalls.length;
  return count > 0 ? `tool_calls: ${String(count)}` : 'текст';
}

// searchapi.api.cloud.yandex.net → yandex.net: на схеме хватает домена, полный хост — в событии.
export function shortHost(host: string): string {
  return host.split('.').slice(-2).join('.');
}

function toolNode(toolName: string): FlowNodeId {
  return isMcpTool(toolName) ? 'mcp' : 'tools';
}

export function modelHostOf(events: readonly HarnessEvent[]): string | null {
  const started = events.find((event) => event.type === 'session_started');
  if (started?.type !== 'session_started') {
    return null;
  }
  try {
    return new URL(started.baseUrl).host;
  } catch {
    return null;
  }
}

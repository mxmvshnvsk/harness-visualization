// Что показать на схеме к месту курсора: последний видимый пакет и то, что сейчас ждёт ответа.
//
// Последний видимый — а не просто последний: служебные события (JSON-RPC, сетевой запрос
// к модели) пакета не дают, и без этого схема пустела бы на каждом из них.
// Ожидания — запрос к модели без ответа, tool без результата, вопрос без ответа пользователя:
// именно это время и занимает сессия, и на схеме его должно быть видно.

import type { HarnessEvent } from '@harness-visualization/harness';
import { eventToPacket, isMcpTool, type FlowContext, type Packet } from './eventToPacket';
import type { EventGroup } from '../../events/eventGroups';
import type { FlowNodeId } from './flowGraph';

export interface ShownPacket extends Packet {
  // По номеру события анимация понимает, что пакет новый.
  sequence: number;
}

export interface Waiting {
  node: FlowNodeId;
  // Цвет рамки ожидания: модель, tool или разрешение.
  group: EventGroup;
  // Что делает участник: «думает», «выполняет kedr__search», «ждёт ответа».
  label: string;
  // С какого события ждём — для анимации и «сколько уже».
  since: string;
}

export interface FlowState {
  packet: ShownPacket | null;
  waiting: Waiting[];
}

export function flowStateAt(events: readonly HarnessEvent[], context: FlowContext): FlowState {
  return { packet: lastPacket(events, context), waiting: findWaiting(events) };
}

function lastPacket(events: readonly HarnessEvent[], context: FlowContext): ShownPacket | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    const packet = event === undefined ? null : eventToPacket(event, context);
    if (event !== undefined && packet !== null) {
      return { ...packet, sequence: event.sequence };
    }
  }
  return null;
}

function findWaiting(events: readonly HarnessEvent[]): Waiting[] {
  // Ключ — что именно ждём: model:<requestId>, tool:<toolCallId>, question:<toolCallId>.
  const open = new Map<string, Waiting>();
  for (const event of events) {
    const opened = opening(event);
    if (opened !== null) {
      open.set(opened.key, opened.waiting);
    }
    const closed = closingKey(event);
    if (closed !== null) {
      open.delete(closed);
    }
  }
  const entries = [...open.entries()];
  // Пока ждём пользователя, tool не выполняется, а стоит в очереди: показываем только вопрос.
  const asking = entries.some(([key]) => key.startsWith('question:'));
  return entries
    .filter(([key]) => !(asking && key.startsWith('tool:')))
    .map(([, waiting]) => waiting);
}

function opening(event: HarnessEvent): { key: string; waiting: Waiting } | null {
  switch (event.type) {
    case 'model_request':
      return {
        key: `model:${event.requestId}`,
        waiting: { node: 'model', group: 'model', label: 'думает…', since: event.timestamp },
      };
    case 'tool_call':
      return {
        key: `tool:${event.toolCallId}`,
        waiting: {
          node: isMcpTool(event.toolName) ? 'mcp' : 'tools',
          group: 'tool',
          label: `выполняет ${event.toolName}…`,
          since: event.timestamp,
        },
      };
    case 'permission_requested':
      return {
        key: `question:${event.toolCallId}`,
        waiting: {
          node: 'user',
          group: 'permission',
          label: 'ждём ответа…',
          since: event.timestamp,
        },
      };
    default:
      return null;
  }
}

function closingKey(event: HarnessEvent): string | null {
  switch (event.type) {
    case 'model_response':
    case 'model_error':
      return `model:${event.requestId}`;
    case 'tool_result':
      return `tool:${event.toolCallId}`;
    case 'permission_resolved':
      return `question:${event.toolCallId}`;
    default:
      return null;
  }
}

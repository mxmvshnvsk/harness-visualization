// Вид «MCP» открытой сессии: какие MCP-серверы харнесс запустил и что они прислали, какие
// тулы серверов видела модель и сколько раз звала, и журнал протокола — сообщения JSON-RPC
// парами «вопрос — ответ» по id, с тем вызовом модели, из-за которого ушёл tools/call.
// У каждой записи — номер события: вид показывает только то, до чего дошёл повтор.

import type { HarnessEvent, McpToolSummary } from '@harness-visualization/harness';

type EventOf<Type extends HarnessEvent['type']> = Extract<HarnessEvent, { type: Type }>;

interface Moment {
  // Номер события и время от начала записи.
  index: number;
  at: number;
  // Шаг модели; null — до первого шага (знакомство с сервером).
  step: number | null;
}

export interface McpServerView {
  name: string;
  command: string;
  args: string[];
  trustAnnotations: boolean;
  started: Moment;
  ready: {
    index: number;
    serverInfo: { name: string; version: string } | null;
    protocolVersion: string | null;
    instructions: string | null;
    tools: McpToolSummary[];
    durationMs: number;
  } | null;
  failed: { index: number; message: string } | null;
  stopped: Moment | null;
}

export interface McpCall {
  // Кто попросил: null — главный агент, иначе id субагента (этап 6c).
  agentId: string | null;
  toolCallId: string;
  toolName: string;
  arguments: unknown;
  decision: string | null;
  reason: string | null;
}

export interface McpPair extends Moment {
  serverName: string;
  method: string;
  // id вопроса; null — уведомление: ответа на него не бывает.
  id: number | string | null;
  request: unknown;
  response: { index: number; at: number; message: unknown; size: number } | null;
  // Для tools/call — просьба модели, из-за которой он ушёл.
  call: McpCall | null;
}

export type McpJournalItem =
  | { kind: 'pair'; pair: McpPair }
  | { kind: 'log'; log: Moment & { serverName: string; text: string } };

export interface McpView {
  servers: McpServerView[];
  journal: McpJournalItem[];
  // Номера событий шагов модели — сколько раз описания тулов ушли модели.
  steps: number[];
  // Вызовы тулов серверов моделью (с приставкой «сервер__»).
  calls: (McpCall & { index: number })[];
}

interface Builder {
  view: McpView;
  startedAt: number;
  step: number | null;
  calls: Map<string, McpCall & { index: number }>;
  open: Map<string, McpPair>;
}

export function projectMcp(events: readonly HarnessEvent[]): McpView {
  const first = events[0];
  const builder: Builder = {
    view: { servers: [], journal: [], steps: [], calls: [] },
    startedAt: first === undefined ? 0 : Date.parse(first.timestamp),
    step: null,
    calls: new Map(),
    open: new Map(),
  };
  events.forEach((event, index) => {
    const moment = {
      index,
      at: Date.parse(event.timestamp) - builder.startedAt,
      step: builder.step,
    };
    collect(builder, event, moment);
  });
  return builder.view;
}

function collect(builder: Builder, event: HarnessEvent, moment: Moment): void {
  switch (event.type) {
    case 'model_request':
      // Шаги — главного агента: у субагента свои (этап 6c).
      if (event.purpose === 'agentStep' && event.agentId === undefined) {
        builder.step = event.iteration;
        builder.view.steps.push(moment.index);
      }
      break;
    case 'mcp_server_starting':
      builder.view.servers.push({
        name: event.serverName,
        command: event.command,
        args: event.args,
        trustAnnotations: event.trustAnnotations,
        started: moment,
        ready: null,
        failed: null,
        stopped: null,
      });
      break;
    case 'mcp_server_ready':
      updateServer(builder, event.serverName, (server) => {
        server.ready = { index: moment.index, ...pickReady(event) };
      });
      break;
    case 'mcp_server_failed':
      updateServer(builder, event.serverName, (server) => {
        server.failed = { index: moment.index, message: event.message };
      });
      break;
    case 'mcp_server_stopped':
      updateServer(builder, event.serverName, (server) => {
        server.stopped = moment;
      });
      break;
    case 'mcp_server_log':
      builder.view.journal.push({
        kind: 'log',
        log: { ...moment, serverName: event.serverName, text: event.text },
      });
      break;
    case 'mcp_message':
      addMessage(builder, event, moment);
      break;
    default:
      collectCall(builder, event, moment);
      break;
  }
}

function pickReady(
  event: EventOf<'mcp_server_ready'>,
): Omit<NonNullable<McpServerView['ready']>, 'index'> {
  return {
    serverInfo: event.serverInfo,
    protocolVersion: event.protocolVersion,
    instructions: event.instructions,
    tools: event.tools,
    durationMs: event.durationMs,
  };
}

function updateServer(
  builder: Builder,
  name: string,
  update: (server: McpServerView) => void,
): void {
  const server = builder.view.servers.findLast((item) => item.name === name);
  if (server !== undefined) {
    update(server);
  }
}

// Просьбы модели к тулам серверов и решения политики по ним.
function collectCall(builder: Builder, event: HarnessEvent, moment: Moment): void {
  if (event.type === 'tool_call' && event.toolName.includes('__')) {
    const call = {
      index: moment.index,
      agentId: event.agentId ?? null,
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      arguments: event.arguments,
      decision: null,
      reason: null,
    };
    builder.calls.set(event.toolCallId, call);
    builder.view.calls.push(call);
  }
  if (event.type === 'permission_evaluated') {
    const call = builder.calls.get(event.toolCallId);
    if (call !== undefined) {
      call.decision = event.decision;
      call.reason = event.reason;
    }
  }
}

function addMessage(builder: Builder, event: EventOf<'mcp_message'>, moment: Moment): void {
  const method = field(event.message, 'method');
  const id = idOf(field(event.message, 'id'));
  const key = `${event.serverName}:${String(id)}`;
  if (typeof method !== 'string') {
    const pair = builder.open.get(key);
    if (pair !== undefined) {
      pair.response = {
        index: moment.index,
        at: moment.at,
        message: event.message,
        size: JSON.stringify(event.message).length,
      };
      builder.open.delete(key);
    }
    return;
  }
  const pair: McpPair = {
    ...moment,
    serverName: event.serverName,
    method,
    id,
    request: event.message,
    response: null,
    call: method === 'tools/call' ? causeOf(builder, event) : null,
  };
  if (id !== null) {
    builder.open.set(key, pair);
  }
  builder.view.journal.push({ kind: 'pair', pair });
}

// tools/call уходит сразу после просьбы модели: последний вызов этого тула без пары.
function causeOf(builder: Builder, event: EventOf<'mcp_message'>): McpCall | null {
  const params = field(event.message, 'params');
  const toolName = `${event.serverName}__${String(field(params, 'name'))}`;
  const paired = new Set(
    builder.view.journal.flatMap((item) =>
      item.kind === 'pair' && item.pair.call !== null ? [item.pair.call.toolCallId] : [],
    ),
  );
  return (
    builder.view.calls.findLast(
      (call) => call.toolName === toolName && !paired.has(call.toolCallId),
    ) ?? null
  );
}

// Сколько токенов занимает описание каждого тула в запросе к модели — по символам схемы,
// тем же коэффициентом, что бюджет prompt.
export function toolTokens(events: readonly HarnessEvent[]): Map<string, number> {
  const request = events.find(
    (event): event is EventOf<'model_request'> =>
      event.type === 'model_request' && event.purpose === 'agentStep',
  );
  const tools = request?.body.tools;
  const charsPerToken = request?.budget?.charsPerToken ?? 3.2;
  const tokens = new Map<string, number>();
  for (const tool of Array.isArray(tools) ? (tools as unknown[]) : []) {
    const name = field(field(tool, 'function'), 'name');
    if (typeof name === 'string') {
      tokens.set(name, Math.round(JSON.stringify(tool).length / charsPerToken));
    }
  }
  return tokens;
}

function idOf(value: unknown): number | string | null {
  return typeof value === 'number' || typeof value === 'string' ? value : null;
}

function field(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  return (value as Record<string, unknown>)[key];
}

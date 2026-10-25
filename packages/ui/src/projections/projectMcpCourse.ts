// Курс про тулы и MCP: из событий записанной сессии — всё, что показывают его шаги.
// Описание тула MCP-сервера в запросе к модели, просьба модели и её проверка политикой,
// разговор харнесса с сервером (знакомство, список тулов, вызов), бюджет prompt по частям
// и вес каждого тула, инструкции сервера в system prompt и пометки тулов.

import type { HarnessEvent, McpToolSummary, PromptBudget } from '@harness-visualization/harness';

type EventOf<Type extends HarnessEvent['type']> = Extract<HarnessEvent, { type: Type }>;

export type McpMessageKind = 'initialize' | 'initialized' | 'list' | 'call' | 'response' | 'other';

export interface McpCourseMessage {
  direction: 'to_server' | 'from_server';
  kind: McpMessageKind;
  // Для ответа — на что он отвечает (по id).
  answers: McpMessageKind | null;
  message: unknown;
}

export interface ToolWeight {
  name: string;
  tokens: number;
  // Тул MCP-сервера (имя с приставкой «сервер__»).
  fromServer: boolean;
}

export interface McpCourse {
  question: string;
  serverName: string;
  trustAnnotations: boolean;
  instructions: string | null;
  // Тулы, которые прислал сервер, и что из них увидит модель.
  serverTools: McpToolSummary[];
  // Описание тула MCP-сервера, как оно ушло модели в первом запросе.
  toolSchema: unknown;
  // Первая просьба модели, где есть тул сервера, — как в ответе провайдера.
  toolCalls: unknown;
  calledTool: string | null;
  permission: EventOf<'permission_evaluated'> | null;
  toolResult: { toolCallId: string; content: string } | null;
  // Разговор с сервером: от знакомства до ответа на первый вызов.
  messages: McpCourseMessage[];
  budgets: PromptBudget[];
  tools: ToolWeight[];
  firstUsage: { inputTokens: number; cachedTokens: number } | null;
  systemPrompt: string;
}

export function projectMcpCourse(events: readonly HarnessEvent[]): McpCourse {
  const steps = events.filter(
    (event): event is EventOf<'model_request'> =>
      event.type === 'model_request' && event.purpose === 'agentStep',
  );
  const first = steps[0];
  const server = serverPart(events);
  return {
    question: find(events, 'user_message')?.text ?? '',
    ...server,
    ...callPart(events, server.serverName, first),
    messages: conversation(events),
    ...budgetPart(steps, server.serverName),
    firstUsage: firstUsage(events, first?.requestId),
    systemPrompt: systemPromptOf(first),
  };
}

function serverPart(
  events: readonly HarnessEvent[],
): Pick<McpCourse, 'serverName' | 'trustAnnotations' | 'instructions' | 'serverTools'> {
  const started = find(events, 'mcp_server_starting');
  const ready = find(events, 'mcp_server_ready');
  const trustAnnotations = started?.trustAnnotations ?? false;
  if (ready === undefined) {
    return {
      serverName: started?.serverName ?? '',
      trustAnnotations,
      instructions: null,
      serverTools: [],
    };
  }
  return {
    serverName: ready.serverName,
    trustAnnotations,
    instructions: ready.instructions,
    serverTools: ready.tools,
  };
}

function callPart(
  events: readonly HarnessEvent[],
  serverName: string,
  first: EventOf<'model_request'> | undefined,
): Pick<McpCourse, 'toolSchema' | 'toolCalls' | 'calledTool' | 'permission' | 'toolResult'> {
  const call = firstServerCall(events, serverName);
  if (call === null) {
    return {
      toolSchema: null,
      toolCalls: null,
      calledTool: null,
      permission: null,
      toolResult: null,
    };
  }
  return {
    toolSchema: toolsOf(first).find((tool) => toolName(tool) === call.toolName) ?? null,
    toolCalls: rawToolCalls(events, call),
    calledTool: call.toolName,
    permission:
      events.find(
        (event): event is EventOf<'permission_evaluated'> =>
          event.type === 'permission_evaluated' && event.toolCallId === call.toolCallId,
      ) ?? null,
    toolResult: resultOf(events, call.toolCallId),
  };
}

function budgetPart(
  steps: readonly EventOf<'model_request'>[],
  serverName: string,
): Pick<McpCourse, 'budgets' | 'tools'> {
  const budgets = steps.flatMap((step) =>
    step.budget === undefined || step.budget === null ? [] : [step.budget],
  );
  const charsPerToken = budgets[0]?.charsPerToken ?? DEFAULT_CHARS_PER_TOKEN;
  return {
    budgets,
    tools: toolsOf(steps[0]).map((tool) => {
      const name = toolName(tool) ?? '';
      return {
        name,
        tokens: Math.round(JSON.stringify(tool).length / charsPerToken),
        fromServer: name.startsWith(`${serverName}__`),
      };
    }),
  };
}

// Если бюджет не записан — примерно столько символов русского текста на токен.
const DEFAULT_CHARS_PER_TOKEN = 3.2;

function find<Type extends HarnessEvent['type']>(
  events: readonly HarnessEvent[],
  type: Type,
): EventOf<Type> | undefined {
  return events.find((event): event is EventOf<Type> => event.type === type);
}

function firstServerCall(
  events: readonly HarnessEvent[],
  serverName: string,
): EventOf<'tool_call'> | null {
  return (
    events.find(
      (event): event is EventOf<'tool_call'> =>
        event.type === 'tool_call' && event.toolName.startsWith(`${serverName}__`),
    ) ?? null
  );
}

// Просьба модели как в сыром ответе провайдера: choices[0].message.tool_calls.
function rawToolCalls(events: readonly HarnessEvent[], call: EventOf<'tool_call'>): unknown {
  const response = events.find(
    (event): event is EventOf<'model_response'> =>
      event.type === 'model_response' &&
      event.reply.toolCalls.some((toolCall) => toolCall.id === call.toolCallId),
  );
  const choice = field(field(response?.body, 'choices'), 0);
  return field(field(choice, 'message'), 'tool_calls') ?? response?.reply.toolCalls ?? null;
}

function resultOf(events: readonly HarnessEvent[], toolCallId: string): McpCourse['toolResult'] {
  const result = events.find(
    (event): event is EventOf<'tool_result'> =>
      event.type === 'tool_result' && event.toolCallId === toolCallId,
  );
  return result === undefined ? null : { toolCallId: result.toolCallId, content: result.content };
}

// Сообщения протокола до ответа на первый tools/call включительно.
export function conversation(events: readonly HarnessEvent[]): McpCourseMessage[] {
  const asked = new Map<unknown, McpMessageKind>();
  const messages: McpCourseMessage[] = [];
  for (const event of events) {
    if (event.type !== 'mcp_message') {
      continue;
    }
    const method = field(event.message, 'method');
    const id = field(event.message, 'id');
    const kind = kindOf(method);
    if (kind !== 'response' && id !== undefined) {
      asked.set(id, kind);
    }
    const answers = kind === 'response' ? (asked.get(id) ?? null) : null;
    messages.push({ direction: event.direction, kind, answers, message: event.message });
    if (answers === 'call') {
      break;
    }
  }
  return messages;
}

function kindOf(method: unknown): McpMessageKind {
  switch (method) {
    case undefined:
      return 'response';
    case 'initialize':
      return 'initialize';
    case 'notifications/initialized':
      return 'initialized';
    case 'tools/list':
      return 'list';
    case 'tools/call':
      return 'call';
    default:
      return 'other';
  }
}

function toolsOf(request: EventOf<'model_request'> | undefined): unknown[] {
  const tools = request?.body.tools;
  return Array.isArray(tools) ? (tools as unknown[]) : [];
}

function toolName(tool: unknown): string | undefined {
  const name = field(field(tool, 'function'), 'name');
  return typeof name === 'string' ? name : undefined;
}

function firstUsage(
  events: readonly HarnessEvent[],
  requestId: string | undefined,
): McpCourse['firstUsage'] {
  const response = events.find(
    (event): event is EventOf<'model_response'> =>
      event.type === 'model_response' && event.requestId === requestId,
  );
  return response === undefined
    ? null
    : {
        inputTokens: response.reply.usage.inputTokens,
        cachedTokens: response.reply.usage.inputCacheHitTokens,
      };
}

function systemPromptOf(request: EventOf<'model_request'> | undefined): string {
  const messages = request?.body.messages;
  const content = field(
    Array.isArray(messages) ? (messages as unknown[])[0] : undefined,
    'content',
  );
  return typeof content === 'string' ? content : '';
}

function field(value: unknown, key: string | number): unknown {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  return (value as Record<string | number, unknown>)[key];
}

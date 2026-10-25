// Фабрика событий для тестов проекций: номера и время проставляются сами,
// а помощники заполняют поля, которые проекции не читают, — в тесте видно только суть.

import type {
  HarnessEvent,
  HarnessEventPayload,
  TokenUsage,
  ToolCall,
} from '@harness-visualization/harness';

const SESSION_ID = 'test0001';
const STARTED_AT = Date.parse('2026-10-25T09:38:10.000Z');
const STEP_MS = 100;

export class EventLog {
  readonly events: HarnessEvent[] = [];

  // agentId — событие субагента (этап 6c); без него — главного агента.
  add(payload: HarnessEventPayload, agentId?: string): this {
    const sequence = this.events.length + 1;
    this.events.push({
      ...payload,
      sequence,
      sessionId: SESSION_ID,
      timestamp: new Date(STARTED_AT + sequence * STEP_MS).toISOString(),
      ...(agentId === undefined ? {} : { agentId }),
    });
    return this;
  }

  // Индекс следующего события — чтобы взять «срез до этого места».
  get length(): number {
    return this.events.length;
  }
}

export function usage(
  inputTokens: number,
  inputCacheHitTokens: number,
  outputTokens = 50,
): TokenUsage {
  return {
    inputTokens,
    inputCacheHitTokens,
    inputCacheMissTokens: inputTokens - inputCacheHitTokens,
    outputTokens,
    reasoningTokens: 0,
  };
}

export function sessionStarted(
  retrievalMode: 'tool' | 'auto' | 'rewrite' = 'tool',
): HarnessEventPayload {
  return {
    type: 'session_started',
    providerName: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-flash',
    reasoningEffort: 'high',
    networkProxy: null,
    searchProvider: null,
    retrievalMode,
  };
}

export function modelRequest(
  requestId: string,
  iteration: number | null,
  purpose: 'agentStep' | 'queryRewrite' | 'groundingJudge' = 'agentStep',
): HarnessEventPayload {
  return {
    type: 'model_request',
    requestId,
    purpose,
    iteration,
    reasoningEffort: 'high',
    method: 'POST',
    url: 'https://api.deepseek.com/chat/completions',
    headers: {},
    body: {},
  };
}

interface ResponseOptions {
  usage: TokenUsage;
  toolCalls?: ToolCall[];
  text?: string | null;
  // null — цена модели неизвестна.
  costUsd?: number | null;
}

export function modelResponse(requestId: string, options: ResponseOptions): HarnessEventPayload {
  const toolCalls = options.toolCalls ?? [];
  const costUsd = options.costUsd === undefined ? 0.0001 : options.costUsd;
  return {
    type: 'model_response',
    requestId,
    status: 200,
    durationMs: 1500,
    body: {},
    reply: {
      responseId: `response-${requestId}`,
      model: 'deepseek-flash',
      finishReason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
      text: options.text ?? null,
      reasoningText: null,
      toolCalls,
      usage: options.usage,
    },
    cost:
      costUsd === null
        ? null
        : {
            currency: 'USD',
            tariffName: 'offPeak',
            inputCacheHit: 0,
            inputCacheMiss: 0,
            output: 0,
            total: costUsd,
            pricesCheckedAt: '2026-10-24',
          },
  };
}

export function toolCall(id: string, name: string, argumentsText = '{}'): ToolCall {
  return { id, name, argumentsText };
}

export function toolCallEvent(call: ToolCall): HarnessEventPayload {
  return {
    type: 'tool_call',
    toolCallId: call.id,
    toolName: call.name,
    argumentsText: call.argumentsText,
    arguments: JSON.parse(call.argumentsText) as unknown,
  };
}

export function permissionEvaluated(
  call: ToolCall,
  decision: 'allow' | 'ask' | 'deny',
): HarnessEventPayload {
  return {
    type: 'permission_evaluated',
    toolCallId: call.id,
    toolName: call.name,
    effects: [],
    targets: [],
    actionDescription: `Вызвать ${call.name}`,
    decision,
    reason: 'тест',
    checks: [],
  };
}

export function toolResult(
  call: ToolCall,
  status: 'success' | 'error' | 'denied' | 'blocked' = 'success',
  costRub: number | null = null,
): HarnessEventPayload {
  return {
    type: 'tool_result',
    toolCallId: call.id,
    toolName: call.name,
    status,
    content: 'результат',
    details: null,
    cost:
      costRub === null
        ? null
        : { currency: 'RUB', amount: costRub, tariffName: 'day', pricesCheckedAt: '2026-10-24' },
    durationMs: 10,
  };
}

export function subagentStarted(subagentId: string, parentToolCallId: string): HarnessEventPayload {
  return {
    type: 'subagent_started',
    subagentId,
    agent: 'researcher',
    parentToolCallId,
    task: `поручение ${subagentId}`,
    toolNames: ['read_file'],
    maxIterations: 6,
    reasoningEffort: 'low',
  };
}

export function subagentFinished(
  subagentId: string,
  parentToolCallId: string,
  report: string | null = `отчёт ${subagentId}`,
): HarnessEventPayload {
  return {
    type: 'subagent_finished',
    subagentId,
    agent: 'researcher',
    parentToolCallId,
    status: report === null ? 'failed' : 'done',
    report,
    errorMessage: report === null ? 'лимит шагов' : null,
    durationMs: 2000,
    modelRequests: 2,
    usage: usage(3000, 0, 200),
    modelCost: null,
  };
}

export function sessionFinished(total: TokenUsage, modelRequests: number): HarnessEventPayload {
  return {
    type: 'session_finished',
    durationMs: 5000,
    modelRequests,
    usage: total,
    modelCost: null,
    toolCosts: [],
  };
}

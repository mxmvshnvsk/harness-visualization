// Проекция: события → вид сессии (sessionView.ts). Один проход по событиям, без побочных
// эффектов: те же события дают тот же вид. Можно передать первые N событий — получится
// сессия «на этот момент»: шаги без ответа помечены pending, тулы — ждущими.

import type { HarnessEvent, HarnessEventType, TokenUsage } from '@harness-visualization/harness';
import { classifyCacheWarmth } from '@harness-visualization/harness/tokenomics';
import type { EventOfType } from '../events/eventTypes';
import type { AgentStep, CacheView, ModelCall, SessionView, ToolCallView } from './sessionView';
import { workMs } from './workTime';

interface Builder {
  view: SessionView;
  calls: Map<string, ModelCall>;
  tools: Map<string, ToolCallView>;
  // Какой ответ модели попросил этот тул: toolCallId → запрос.
  toolOwners: Map<string, ModelCall>;
  // input tokens предыдущего шага агента — для объяснения кэша.
  // input прошлого шага — у каждого агента свой: ключ — agentId, у главного пустая строка.
  previousStepInput: Map<string, number>;
  finishedDurationMs: number | null;
}

type Handlers = {
  [Type in HarnessEventType]?: (builder: Builder, event: EventOfType<Type>) => void;
};

const HANDLERS: Handlers = {
  session_started: (builder, event) => {
    builder.view.kind = 'session';
    builder.view.sessionId = event.sessionId;
    builder.view.model = event.model;
    builder.view.retrievalMode = event.retrievalMode;
  },
  grounding_check_started: (builder, event) => {
    builder.view.kind = 'groundingCheck';
    builder.view.sessionId = event.sessionId;
    builder.view.model = event.judgeModel;
  },
  user_message: (builder, event) => {
    builder.view.question ??= event.text;
  },
  query_rewritten: (builder, event) => {
    builder.view.retrieval.rewrite = event;
  },
  context_retrieved: (builder, event) => {
    builder.view.retrieval.retrieved = event;
  },
  model_request: addModelCall,
  model_response: addModelResponse,
  model_error: (builder, event) => {
    const call = builder.calls.get(event.requestId);
    if (call !== undefined) {
      call.error = event;
      setStepOutcome(builder, call, 'error');
    }
  },
  tool_call: addToolCall,
  permission_evaluated: (builder, event) => {
    withTool(builder, event.toolCallId, (tool) => {
      tool.evaluation = event;
    });
  },
  permission_requested: (builder, event) => {
    withTool(builder, event.toolCallId, (tool) => {
      tool.question = event;
      tool.status = 'waitingForUser';
    });
  },
  permission_resolved: (builder, event) => {
    withTool(builder, event.toolCallId, (tool) => {
      tool.answer = event;
      tool.status = 'pending';
    });
  },
  tool_result: addToolResult,
  tool_result_truncated: (builder, event) => {
    withTool(builder, event.toolCallId, (tool) => {
      tool.truncation = event;
    });
  },
  assistant_message: (builder, event) => {
    builder.view.answer = event.text;
  },
  session_finished: (builder, event) => {
    if (builder.view.status !== 'failed') {
      builder.view.status = 'finished';
    }
    builder.finishedDurationMs = event.durationMs;
  },
  error: (builder, event) => {
    builder.view.errors.push(event.message);
    builder.view.status = 'failed';
  },
};

export function projectSession(events: readonly HarnessEvent[]): SessionView {
  const builder = createBuilder();
  for (const event of events) {
    // TypeScript не связывает тип события с ключом таблицы сам — помогаем приведением.
    const handle = HANDLERS[event.type] as
      ((builder: Builder, event: HarnessEvent) => void) | undefined;
    handle?.(builder, event);
  }
  builder.view.totals.durationMs = builder.finishedDurationMs ?? elapsedMs(events);
  builder.view.totals.workMs = workMs(events);
  return builder.view;
}

function createBuilder(): Builder {
  return {
    view: {
      sessionId: null,
      kind: 'unknown',
      question: null,
      model: null,
      retrievalMode: null,
      status: 'inProgress',
      steps: [],
      modelCalls: [],
      toolCalls: [],
      retrieval: { rewrite: null, retrieved: null },
      answer: null,
      errors: [],
      totals: {
        modelRequests: 0,
        usage: emptyUsage(),
        modelCosts: [],
        unpricedModelRequests: 0,
        toolCosts: [],
        durationMs: 0,
        workMs: 0,
      },
    },
    calls: new Map(),
    tools: new Map(),
    toolOwners: new Map(),
    previousStepInput: new Map(),
    finishedDurationMs: null,
  };
}

function addModelCall(builder: Builder, event: EventOfType<'model_request'>): void {
  const call: ModelCall = {
    agentId: event.agentId ?? null,
    requestId: event.requestId,
    purpose: event.purpose,
    iteration: event.iteration,
    request: event,
    response: null,
    error: null,
    toolCallIds: [],
    cache: null,
  };
  builder.calls.set(call.requestId, call);
  builder.view.modelCalls.push(call);
  builder.view.totals.modelRequests += 1;
  // Шаги — главного агента: у субагента свои (этап 6c), они в его этапах инспектора.
  if (event.purpose === 'agentStep' && event.iteration !== null && event.agentId === undefined) {
    builder.view.steps.push({
      iteration: event.iteration,
      call,
      toolCalls: [],
      outcome: 'pending',
    });
  }
}

function addModelResponse(builder: Builder, event: EventOfType<'model_response'>): void {
  const call = builder.calls.get(event.requestId);
  if (call === undefined) {
    return;
  }
  const { usage, toolCalls } = event.reply;
  call.response = event;
  call.toolCallIds = toolCalls.map((toolCall) => toolCall.id);
  for (const id of call.toolCallIds) {
    builder.toolOwners.set(id, call);
  }
  const isAgentStep = call.purpose === 'agentStep';
  const agent = call.agentId ?? '';
  call.cache = describeCache(
    usage,
    isAgentStep ? (builder.previousStepInput.get(agent) ?? null) : null,
  );
  if (isAgentStep) {
    builder.previousStepInput.set(agent, usage.inputTokens);
    setStepOutcome(builder, call, toolCalls.length > 0 ? 'toolCalls' : 'answer');
  }
  addUsage(builder.view.totals.usage, usage);
  if (event.cost === null) {
    builder.view.totals.unpricedModelRequests += 1;
  } else {
    addMoney(builder.view.totals.modelCosts, event.cost.currency, event.cost.total);
  }
}

function describeCache(usage: TokenUsage, previousStepInput: number | null): CacheView {
  return {
    hitTokens: usage.inputCacheHitTokens,
    missTokens: usage.inputCacheMissTokens,
    share: usage.inputTokens === 0 ? 0 : usage.inputCacheHitTokens / usage.inputTokens,
    warmth: classifyCacheWarmth(usage),
    exceedsPreviousPrompt:
      previousStepInput === null ? null : usage.inputCacheHitTokens > previousStepInput,
    previousStepInputTokens: previousStepInput,
  };
}

function setStepOutcome(builder: Builder, call: ModelCall, outcome: AgentStep['outcome']): void {
  const step = builder.view.steps.find((item) => item.call === call);
  if (step !== undefined) {
    step.outcome = outcome;
  }
}

function addToolCall(builder: Builder, event: EventOfType<'tool_call'>): void {
  const tool: ToolCallView = {
    toolCallId: event.toolCallId,
    toolName: event.toolName,
    call: event,
    evaluation: null,
    question: null,
    answer: null,
    result: null,
    truncation: null,
    status: 'pending',
  };
  builder.tools.set(tool.toolCallId, tool);
  builder.view.toolCalls.push(tool);
  const owner = builder.toolOwners.get(tool.toolCallId);
  builder.view.steps.find((step) => step.call === owner)?.toolCalls.push(tool);
}

function addToolResult(builder: Builder, event: EventOfType<'tool_result'>): void {
  withTool(builder, event.toolCallId, (tool) => {
    tool.result = event;
    tool.status = event.status;
  });
  if (event.cost !== null) {
    addToolCost(builder, event.toolName, event.cost.currency, event.cost.amount);
  }
}

function addToolCost(builder: Builder, toolName: string, currency: string, amount: number): void {
  const totals = builder.view.totals.toolCosts;
  const total = totals.find((item) => item.toolName === toolName && item.currency === currency);
  if (total === undefined) {
    totals.push({ toolName, currency, total: amount, calls: 1 });
  } else {
    total.total += amount;
    total.calls += 1;
  }
}

function withTool(
  builder: Builder,
  toolCallId: string,
  update: (tool: ToolCallView) => void,
): void {
  const tool = builder.tools.get(toolCallId);
  if (tool !== undefined) {
    update(tool);
  }
}

function emptyUsage(): TokenUsage {
  return {
    inputTokens: 0,
    inputCacheHitTokens: 0,
    inputCacheMissTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
  };
}

function addUsage(total: TokenUsage, usage: TokenUsage): void {
  total.inputTokens += usage.inputTokens;
  total.inputCacheHitTokens += usage.inputCacheHitTokens;
  total.inputCacheMissTokens += usage.inputCacheMissTokens;
  total.outputTokens += usage.outputTokens;
  total.reasoningTokens += usage.reasoningTokens;
}

function addMoney(
  totals: { currency: string; total: number }[],
  currency: string,
  amount: number,
): void {
  const total = totals.find((item) => item.currency === currency);
  if (total === undefined) {
    totals.push({ currency, total: amount });
  } else {
    total.total += amount;
  }
}

function elapsedMs(events: readonly HarnessEvent[]): number {
  const first = events.at(0);
  const last = events.at(-1);
  if (first === undefined || last === undefined) {
    return 0;
  }
  return Date.parse(last.timestamp) - Date.parse(first.timestamp);
}

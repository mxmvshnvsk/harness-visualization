// Вкладка «Агенты» (этап 6c.3): кто когда работал, что кому поручили и сколько стоило каждому.
// Дорожки — по настоящему времени событий, поэтому параллельная работа субагентов видна как есть
// (повтор на «Потоке» идёт по порядку событий). Срез — до курсора: незаконченный отрезок тянется
// до последнего показанного события.

import type { HarnessEvent } from '@harness-visualization/harness';
import { projectSubagents, type AgentColor, type SubagentRun } from './projectSubagents';

export type SegmentKind = 'model' | 'tool' | 'wait';

export interface AgentSegment {
  kind: SegmentKind;
  // Мс от начала записи; end — null, пока не закончился.
  start: number;
  end: number | null;
  label: string;
}

export interface AgentCall {
  toolCallId: string;
  toolName: string;
  // Запрос поиска, если это поиск; иначе null.
  query: string | null;
  argumentsText: string;
}

export interface AgentLane {
  // main — главный агент, иначе id субагента.
  id: string;
  color: AgentColor;
  segments: AgentSegment[];
  modelRequests: number;
  inputTokens: number;
  outputTokens: number;
  // Самый большой prompt (оценка харнесса) и на каком шаге; null — бюджета в трейсе нет.
  maxPrompt: { tokens: number; step: number | null } | null;
  // Сколько вернули тулы этого агента, ≈ токенов.
  toolResultTokens: number;
  calls: AgentCall[];
}

export interface AgentsView {
  lanes: AgentLane[];
  runs: SubagentRun[];
  // Мс от начала записи до последнего показанного события.
  now: number;
  // Лимит пресета из бюджета prompt; null — бюджета нет.
  limitTokens: number | null;
  charsPerToken: number;
}

const DEFAULT_CHARS_PER_TOKEN = 3.24;

interface Builder {
  startedAt: number;
  lanes: Map<string, AgentLane>;
  open: Map<string, AgentSegment>;
  view: AgentsView;
}

export function projectAgents(events: readonly HarnessEvent[], shown: number): AgentsView {
  const visible = events.slice(0, shown);
  const first = visible[0];
  const startedAt = first === undefined ? 0 : Date.parse(first.timestamp);
  const runs = projectSubagents(visible);
  const builder: Builder = {
    startedAt,
    lanes: new Map([['main', newLane('main', 'main')]]),
    open: new Map(),
    view: {
      lanes: [],
      runs,
      now: 0,
      limitTokens: null,
      charsPerToken: DEFAULT_CHARS_PER_TOKEN,
    },
  };
  for (const run of runs) {
    builder.lanes.set(run.subagentId, newLane(run.subagentId, run.color));
  }
  for (const event of visible) {
    collect(builder, event);
  }
  const last = visible.at(-1);
  builder.view.now = last === undefined ? 0 : Date.parse(last.timestamp) - startedAt;
  builder.view.lanes = [...builder.lanes.values()];
  return builder.view;
}

function newLane(id: string, color: AgentColor): AgentLane {
  return {
    id,
    color,
    segments: [],
    modelRequests: 0,
    inputTokens: 0,
    outputTokens: 0,
    maxPrompt: null,
    toolResultTokens: 0,
    calls: [],
  };
}

function collect(builder: Builder, event: HarnessEvent): void {
  const lane = builder.lanes.get(event.agentId ?? 'main');
  if (lane === undefined) {
    return;
  }
  const at = Date.parse(event.timestamp) - builder.startedAt;
  switch (event.type) {
    case 'model_request':
      openModel(builder, lane, event, at);
      break;
    case 'model_response':
    case 'model_error':
      closeModel(builder, lane, event, at);
      break;
    case 'tool_call':
      openTool(builder, lane, event, at);
      break;
    case 'tool_result':
      closeTool(builder, lane, event, at);
      break;
    default:
      break;
  }
}

type EventOf<Type extends HarnessEvent['type']> = Extract<HarnessEvent, { type: Type }>;

function openModel(builder: Builder, lane: AgentLane, event: EventOf<'model_request'>, at: number) {
  const step = event.purpose === 'agentStep' ? event.iteration : null;
  const segment: AgentSegment = {
    kind: 'model',
    start: at,
    end: null,
    label:
      step === null ? `служебный запрос: ${event.purpose}` : `шаг ${String(step)}: модель думает`,
  };
  lane.segments.push(segment);
  builder.open.set(`model:${event.requestId}`, segment);
  lane.modelRequests += 1;
  const budget = event.budget ?? null;
  if (budget !== null) {
    builder.view.limitTokens = budget.limitTokens;
    builder.view.charsPerToken = budget.charsPerToken;
    if (lane.maxPrompt === null || budget.estimate.total > lane.maxPrompt.tokens) {
      lane.maxPrompt = { tokens: budget.estimate.total, step };
    }
  }
}

function closeModel(
  builder: Builder,
  lane: AgentLane,
  event: EventOf<'model_response'> | EventOf<'model_error'>,
  at: number,
): void {
  const segment = builder.open.get(`model:${event.requestId}`);
  if (segment !== undefined) {
    segment.end = at;
    builder.open.delete(`model:${event.requestId}`);
  }
  if (event.type === 'model_response') {
    lane.inputTokens += event.reply.usage.inputTokens;
    lane.outputTokens += event.reply.usage.outputTokens;
    if (segment !== undefined) {
      segment.label = `${segment.label} → ${describeReply(event, lane.id)}`;
    }
  }
}

function describeReply(event: EventOf<'model_response'>, laneId: string): string {
  const names = event.reply.toolCalls.map((call) => call.name);
  if (names.length > 0) {
    return `просит ${names.join(', ')}`;
  }
  return laneId === 'main' ? 'ответ' : 'отчёт';
}

function openTool(builder: Builder, lane: AgentLane, event: EventOf<'tool_call'>, at: number) {
  const delegates = event.toolName === 'delegate_task';
  const segment: AgentSegment = {
    kind: delegates ? 'wait' : 'tool',
    start: at,
    end: null,
    label: delegates
      ? 'ждёт отчёта субагента'
      : `${event.toolName} ${shorten(event.argumentsText)}`,
  };
  lane.segments.push(segment);
  builder.open.set(`tool:${event.toolCallId}`, segment);
  if (!delegates) {
    lane.calls.push({
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      query: queryOf(event.arguments),
      argumentsText: event.argumentsText,
    });
  }
}

function closeTool(builder: Builder, lane: AgentLane, event: EventOf<'tool_result'>, at: number) {
  const segment = builder.open.get(`tool:${event.toolCallId}`);
  if (segment !== undefined) {
    segment.end = at;
    builder.open.delete(`tool:${event.toolCallId}`);
  }
  if (event.toolName !== 'delegate_task') {
    lane.toolResultTokens += Math.round(event.content.length / builder.view.charsPerToken);
  }
}

function queryOf(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || !('query' in value)) {
    return null;
  }
  const { query } = value;
  return typeof query === 'string' ? query : null;
}

function shorten(text: string, limit = 60): string {
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

// Сколько токенов в отчёте — той же оценкой, что бюджет prompt.
export function reportTokens(run: SubagentRun, charsPerToken: number): number {
  return Math.round((run.report?.length ?? 0) / charsPerToken);
}

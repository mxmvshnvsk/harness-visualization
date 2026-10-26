// Вкладка «Агенты» (этап 6c.3): кто когда работал, что кому поручили и сколько стоило каждому.
// Дорожки — по настоящему времени событий, поэтому параллельная работа субагентов видна как есть
// (повтор на «Потоке» идёт по порядку событий). Срез — до курсора: незаконченный отрезок тянется
// до последнего показанного события.

import type { HarnessEvent, OrchestrationMode } from '@harness-visualization/harness';
import { projectSubagents, type AgentColor, type SubagentRun } from './projectSubagents';
import { workEnd } from './workTime';

// step — шаг каркаса оркестрации, который задал код (этап 6d).
export type SegmentKind = 'model' | 'tool' | 'wait' | 'step';

export interface AgentSegment {
  kind: SegmentKind;
  // Мс от начала записи; end — null, пока не закончился.
  start: number;
  end: number | null;
  label: string;
  // Работа после возврата на доработку (этап 6d.2).
  rework: boolean;
}

export interface AgentCall {
  toolCallId: string;
  toolName: string;
  // Запрос поиска, если это поиск; иначе null.
  query: string | null;
  argumentsText: string;
}

export interface AgentLane {
  // main — главный агент (или оркестратор), steps — шаги каркаса, иначе id субагента.
  id: string;
  label: string;
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
  // Режим оркестрации хода; null — обычный агент.
  mode: OrchestrationMode | null;
  hasRework: boolean;
}

const DEFAULT_CHARS_PER_TOKEN = 3.24;

interface Builder {
  startedAt: number;
  lanes: Map<string, AgentLane>;
  open: Map<string, AgentSegment>;
  // Кто сейчас дорабатывает — его отрезки помечаются доработкой.
  reworking: Set<string>;
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
    reworking: new Set(),
    view: {
      lanes: [],
      runs,
      now: 0,
      limitTokens: null,
      charsPerToken: DEFAULT_CHARS_PER_TOKEN,
      mode: null,
      hasRework: false,
    },
  };
  for (const run of runs) {
    builder.lanes.set(run.subagentId, newLane(run.subagentId, run.color));
  }
  for (const event of visible) {
    collect(builder, event);
  }
  // Дорожки кончаются на последней работе: простой после ответа — не работа (workTime.ts).
  const last = workEnd(visible);
  builder.view.now = last === undefined ? 0 : Date.parse(last.timestamp) - startedAt;
  const main = builder.lanes.get('main');
  if (main !== undefined) {
    main.label = MAIN_LABELS[builder.view.mode ?? 'agent'];
  }
  builder.view.lanes = [...builder.lanes.values()];
  return builder.view;
}

// Главный агент в оркестрации — оркестратор, а в пайплайне — только модель шага «ответ».
const MAIN_LABELS: Record<OrchestrationMode | 'agent', string> = {
  agent: 'главный агент',
  pipeline: 'модель ответа',
  superagent: 'оркестратор',
  hybrid: 'оркестратор',
};

function newLane(id: string, color: AgentColor, label = id): AgentLane {
  return {
    id,
    label,
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
  collectOrchestration(builder, event);
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

// Оркестрация (этап 6d): шаги кода — своя дорожка, доработка — пометка на дорожке исполнителя.
function collectOrchestration(builder: Builder, event: HarnessEvent): void {
  const at = Date.parse(event.timestamp) - builder.startedAt;
  if (event.type === 'orchestration_started') {
    builder.view.mode = event.mode;
  }
  if (event.type === 'pipeline_step_started') {
    const steps = stepsLane(builder);
    const segment = {
      kind: 'step' as const,
      start: at,
      end: null,
      label: event.title,
      rework: false,
    };
    steps.segments.push(segment);
    builder.open.set(`step:${event.stepId}`, segment);
  }
  if (event.type === 'pipeline_step_finished') {
    const segment = builder.open.get(`step:${event.stepId}`);
    if (segment !== undefined) {
      segment.end = at;
      segment.label = `${segment.label} → ${event.summary}`;
      builder.open.delete(`step:${event.stepId}`);
    }
  }
  if (event.type === 'subagent_resumed') {
    builder.reworking.add(event.subagentId);
    builder.view.hasRework = true;
  }
  if (event.type === 'subagent_finished') {
    builder.reworking.delete(event.subagentId);
  }
}

// Дорожка шагов каркаса — первой, над агентами: порядок задаёт она.
function stepsLane(builder: Builder): AgentLane {
  const existing = builder.lanes.get('steps');
  if (existing !== undefined) {
    return existing;
  }
  const lane = newLane('steps', 'code', 'шаги каркаса');
  builder.lanes = new Map([['steps', lane], ...builder.lanes]);
  return lane;
}

function openModel(builder: Builder, lane: AgentLane, event: EventOf<'model_request'>, at: number) {
  const step = event.purpose === 'agentStep' ? event.iteration : null;
  const segment: AgentSegment = {
    kind: 'model',
    start: at,
    end: null,
    label:
      step === null ? `служебный запрос: ${event.purpose}` : `шаг ${String(step)}: модель думает`,
    rework: builder.reworking.has(lane.id),
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

// Тулы, пока идут которые агент ждёт субагента: поручение и приёмка с доработкой (этап 6d.2).
const WAITING_TOOLS = new Set(['delegate_task', 'review_report']);
const WAITING_LABELS: Record<string, string> = {
  delegate_task: 'ждёт отчёта субагента',
  review_report: 'приёмка: принять или ждать доработки',
};

function openTool(builder: Builder, lane: AgentLane, event: EventOf<'tool_call'>, at: number) {
  const delegates = WAITING_TOOLS.has(event.toolName);
  const segment: AgentSegment = {
    kind: delegates ? 'wait' : 'tool',
    start: at,
    end: null,
    label: delegates
      ? (WAITING_LABELS[event.toolName] ?? 'ждёт субагента')
      : `${event.toolName} ${shorten(event.argumentsText)}`,
    rework: builder.reworking.has(lane.id),
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
  if (!WAITING_TOOLS.has(event.toolName)) {
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

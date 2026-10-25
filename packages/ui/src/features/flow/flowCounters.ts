// Счётчики на узлах схемы: что уже прошло через участника к этому месту сессии.

import type { HarnessEvent, HarnessEventType } from '@harness-visualization/harness';
import type { EventOfType } from '../../events/eventTypes';
import { plural } from '../../text/plural';
import type { FlowNodeId } from './flowGraph';
import { isMcpTool, type FlowContext } from './eventToPacket';

export type FlowCounters = Record<FlowNodeId, string>;

interface Tally {
  questions: number;
  answers: number;
  modelRequests: number;
  inputTokens: number;
  mcpCalls: number;
  toolCalls: number;
  networkRequests: number;
  decisions: number;
}

type Counters = {
  [Type in HarnessEventType]?: (
    tally: Tally,
    event: EventOfType<Type>,
    context: FlowContext,
  ) => void;
};

const COUNTERS: Counters = {
  user_message: (tally) => {
    tally.questions += 1;
  },
  assistant_message: (tally) => {
    tally.answers += 1;
  },
  model_request: (tally) => {
    tally.modelRequests += 1;
  },
  model_response: (tally, event) => {
    tally.inputTokens += event.reply.usage.inputTokens;
  },
  tool_call: (tally, event) => {
    if (isMcpTool(event.toolName)) {
      tally.mcpCalls += 1;
    } else {
      tally.toolCalls += 1;
    }
  },
  context_retrieved: (tally) => {
    tally.mcpCalls += 1;
  },
  network_request: (tally, event, context) => {
    // Запросы к модели видны на её узле; здесь — поиск и сайты.
    if (event.host !== context.modelHost) {
      tally.networkRequests += 1;
    }
  },
  permission_evaluated: (tally) => {
    tally.decisions += 1;
  },
};

export function countFlow(events: readonly HarnessEvent[], context: FlowContext): FlowCounters {
  const tally: Tally = {
    questions: 0,
    answers: 0,
    modelRequests: 0,
    inputTokens: 0,
    mcpCalls: 0,
    toolCalls: 0,
    networkRequests: 0,
    decisions: 0,
  };
  for (const event of events) {
    const count = COUNTERS[event.type] as
      ((tally: Tally, event: HarnessEvent, context: FlowContext) => void) | undefined;
    count?.(tally, event, context);
  }
  return {
    user: `${plural(tally.questions, QUESTIONS)} · ${plural(tally.answers, ANSWERS)}`,
    harness: `${plural(tally.decisions, DECISIONS)} политики`,
    model: `${plural(tally.modelRequests, REQUESTS)} · input ${tally.inputTokens.toLocaleString('ru-RU')}`,
    mcp: plural(tally.mcpCalls, CALLS),
    tools: plural(tally.toolCalls, CALLS),
    network: plural(tally.networkRequests, REQUESTS),
  };
}

const QUESTIONS = { one: 'вопрос', few: 'вопроса', many: 'вопросов' };
const ANSWERS = { one: 'ответ', few: 'ответа', many: 'ответов' };
const DECISIONS = { one: 'решение', few: 'решения', many: 'решений' };
const REQUESTS = { one: 'запрос', few: 'запроса', many: 'запросов' };
const CALLS = { one: 'вызов', few: 'вызова', many: 'вызовов' };

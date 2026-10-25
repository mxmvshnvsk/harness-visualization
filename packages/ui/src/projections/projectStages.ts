// Этапы сессии для инспектора: «Подготовка» (всё до первого шага агента), шаги агента и ответ.
// Строятся из всех событий сразу — так будущие этапы видны приглушёнными, а повтор только
// отмечает, до какого события дошёл. Строка — одно событие: время, текст и что раскрыть.

import type { HarnessEvent, HarnessEventType } from '@harness-visualization/harness';
import type { EventOfType } from '../events/eventTypes';
import { plural } from '../text/plural';

export interface StageRow {
  // Номер события в списке — по нему повтор отмечает пройденное.
  index: number;
  // Мс от начала записи.
  at: number;
  // Имя тула или другой код — моноширинным перед текстом; null — нет.
  code: string | null;
  text: string;
}

// question — следующий вопрос того же диалога (этап 6.1): у первого вопроса — «Подготовка».
export type StageKind = 'prep' | 'question' | 'agent' | 'answer';

export interface Stage {
  id: string;
  kind: StageKind;
  title: string;
  // Короткая пометка рядом с заголовком: tool_calls: 2, текст, до модели.
  badge: string;
  // Запрос к модели этого шага — его раскрывает «Подробнее».
  requestId: string | null;
  // Первое и последнее событие этапа.
  firstIndex: number;
  lastIndex: number;
  rows: StageRow[];
}

type Describe<Type extends HarnessEventType> = (
  event: EventOfType<Type>,
  names: Map<string, string>,
) => Pick<StageRow, 'code' | 'text'> | null;

type Describers = { [Type in HarnessEventType]?: Describe<Type> };

const DESCRIBE: Describers = {
  mcp_server_starting: (event) => ({
    code: event.serverName,
    text: 'харнесс запускает MCP-сервер',
  }),
  mcp_server_ready: (event) => ({
    code: event.serverName,
    text: `MCP-сервер готов: ${plural(event.tools.length, TOOLS)} за ${String(event.durationMs)} мс`,
  }),
  mcp_server_failed: (event) => ({
    code: event.serverName,
    text: `MCP-сервер не запустился: ${event.message}`,
  }),
  user_message: (event) => ({ code: null, text: `вопрос пользователя: «${event.text}»` }),
  query_rewritten: (event) => ({ code: null, text: `поисковый query: «${event.query}»` }),
  context_retrieved: (event) => ({
    code: event.toolName,
    text: `харнесс нашёл сам и подмешал в контекст — ${event.status}, ${String(event.durationMs)} мс`,
  }),
  prompt_assembled: (event) => ({
    code: null,
    text: `prompt собран: ${plural(event.messages.length, MESSAGES)}, ${plural(event.toolNames.length, TOOLS)}`,
  }),
  model_request: (event) => ({
    code: null,
    text: `запрос к модели ушёл${PURPOSES[event.purpose]}${describeBudget(event.budget)}`,
  }),
  model_response: (event) => ({ code: null, text: describeResponse(event) }),
  model_error: (event) => ({ code: null, text: `модель ответила ошибкой: ${event.message}` }),
  permission_evaluated: (event, names) => ({
    code: names.get(event.toolCallId) ?? null,
    text: `политика: ${event.decision} — ${event.reason}`,
  }),
  permission_requested: (event, names) => ({
    code: names.get(event.toolCallId) ?? null,
    text: `спрашиваем пользователя: ${event.actionDescription}`,
  }),
  permission_resolved: (event, names) => ({
    code: names.get(event.toolCallId) ?? null,
    text: `ответ: ${describeAnswer(event)}`,
  }),
  tool_result: (event) => ({
    code: event.toolName,
    text: `${event.status}, ${String(event.durationMs)} мс`,
  }),
  assistant_message: (event) => ({ code: null, text: shorten(event.text) }),
  awaiting_question: (event) => ({
    code: null,
    text: `ход ${String(event.turn)} закончен — сессия ждёт следующего вопроса, история остаётся`,
  }),
  error: (event) => ({ code: null, text: `ошибка: ${event.message}` }),
};

export function projectStages(events: readonly HarnessEvent[]): Stage[] {
  const first = events[0];
  const startedAt = first === undefined ? 0 : Date.parse(first.timestamp);
  const names = new Map<string, string>();
  const stages: Stage[] = [
    newStage(
      { id: 'prep', kind: 'prep', title: 'Подготовка', badge: 'до модели', requestId: null },
      0,
    ),
  ];
  events.forEach((event, index) => {
    if (event.type === 'tool_call') {
      names.set(event.toolCallId, event.toolName);
    }
    openStageFor(stages, event, index);
    const describe = DESCRIBE[event.type] as
      | ((
          event: HarnessEvent,
          names: Map<string, string>,
        ) => Pick<StageRow, 'code' | 'text'> | null)
      | undefined;
    const row = describe?.(event, names);
    const stage = stages.at(-1);
    if (row && stage !== undefined) {
      stage.rows.push({ ...row, index, at: Date.parse(event.timestamp) - startedAt });
      stage.lastIndex = index;
    }
    if (event.type === 'model_response' && stage?.requestId === event.requestId) {
      stage.badge =
        event.reply.toolCalls.length > 0
          ? `tool_calls: ${String(event.reply.toolCalls.length)}`
          : 'текст';
    }
  });
  // Подготовка без строк — например, у трейса без запуска MCP — не показываем.
  return stages.filter((stage) => stage.rows.length > 0);
}

// Шаг агента начинается запросом к модели, ответ пользователю — своим этапом, следующий вопрос
// диалога — своим. Номер хода — по числу вопросов: у второго вопроса заголовки «Вопрос 2 · …».
function openStageFor(stages: Stage[], event: HarnessEvent, index: number): void {
  const turn = stages.filter((stage) => stage.kind === 'question').length + 1;
  const prefix = turn > 1 ? `Вопрос ${String(turn)} · ` : '';
  if (event.type === 'user_message' && stages.some((stage) => stage.kind === 'answer')) {
    const next = turn + 1;
    stages.push(
      newStage(
        {
          id: `question-${String(next)}`,
          kind: 'question',
          title: `Вопрос ${String(next)}`,
          badge: 'user_message',
          requestId: null,
        },
        index,
      ),
    );
  }
  if (event.type === 'model_request' && event.purpose === 'agentStep') {
    const step = String(event.iteration ?? stages.length);
    stages.push(
      newStage(
        {
          id: `turn-${String(turn)}-step-${step}`,
          kind: 'agent',
          title: `${prefix}Шаг ${step} · agentStep`,
          badge: 'модель думает…',
          requestId: event.requestId,
        },
        index,
      ),
    );
  }
  if (event.type === 'assistant_message') {
    stages.push(
      newStage(
        {
          id: `answer-${String(turn)}`,
          kind: 'answer',
          title: turn > 1 ? `Ответ на вопрос ${String(turn)}` : 'Ответ пользователю',
          badge: 'assistant_message',
          requestId: null,
        },
        index,
      ),
    );
  }
}

type StageHead = Pick<Stage, 'id' | 'kind' | 'title' | 'badge' | 'requestId'>;

function newStage(head: StageHead, index: number): Stage {
  return { ...head, firstIndex: index, lastIndex: index, rows: [] };
}

// Где сейчас повтор: этап, в котором последнее показанное событие; -1 — ничего не показано.
export function activeStage(stages: readonly Stage[], shown: number): Stage | null {
  const last = shown - 1;
  return stages.findLast((stage) => stage.firstIndex <= last) ?? null;
}

const PURPOSES: Record<EventOfType<'model_request'>['purpose'], string> = {
  agentStep: '',
  queryRewrite: ': переформулировать вопрос в поисковый query',
  groundingJudge: ': судья оценивает claim',
};

// Бюджет — оценка до ответа: «prompt ≈ 4 600 из 12 000».
function describeBudget(budget: EventOfType<'model_request'>['budget']): string {
  if (budget === undefined || budget === null) {
    return '';
  }
  const share = Math.round((budget.estimate.total / budget.limitTokens) * 100);
  return ` · prompt ≈ ${budget.estimate.total.toLocaleString('ru-RU')} из ${budget.limitTokens.toLocaleString('ru-RU')} (${String(share)} %)`;
}

function describeResponse(event: EventOfType<'model_response'>): string {
  const { usage, toolCalls } = event.reply;
  const share =
    usage.inputTokens === 0 ? 0 : Math.round((usage.inputCacheHitTokens / usage.inputTokens) * 100);
  const seconds = (event.durationMs / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 });
  const what = toolCalls.length > 0 ? `просит ${plural(toolCalls.length, TOOLS)}` : 'текст';
  return `ответ — ${what}: ${usage.inputTokens.toLocaleString('ru-RU')} input tokens, из кэша ${String(share)} %, output ${usage.outputTokens.toLocaleString('ru-RU')} · ${seconds} с`;
}

function describeAnswer(event: EventOfType<'permission_resolved'>): string {
  if (event.answeredBy === 'user') {
    return event.approved ? 'да' : 'нет';
  }
  return event.answeredBy === 'timeout'
    ? 'не ответили вовремя — запрещено'
    : 'спросить некого — запрещено';
}

function shorten(text: string, limit = 220): string {
  const line = text.replaceAll('\n', ' ');
  return line.length > limit ? `${line.slice(0, limit)}…` : line;
}

const TOOLS = { one: 'тул', few: 'тула', many: 'тулов' };
const MESSAGES = { one: 'message', few: 'messages', many: 'messages' };

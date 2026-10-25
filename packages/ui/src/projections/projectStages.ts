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
  // Строка о субагенте (этап 6c): начало работы — с неё раскрываются его шаги, конец — отчёт.
  subagent?: { id: string; edge: 'start' | 'end' };
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

const SKILL_TRIGGERS = {
  always: 'скилл загружен при старте: инструкция в system prompt',
  model: 'модель загрузила скилл тулом load_skill',
  user: 'пользователь загрузил скилл командой /имя',
} as const;

function describeRestored(restored: EventOfType<'history_compacted'>['restored']): string {
  if (restored === undefined) {
    return '';
  }
  const parts = [
    ...(restored.memo ? ['memo.md'] : []),
    ...(restored.progress ? ['план'] : []),
    ...restored.skills.map((name) => `скилл ${name}`),
  ];
  return parts.length === 0 ? '' : `; к сводке дописаны как есть: ${parts.join(', ')}`;
}

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
  tool_result_truncated: (event) => ({
    code: event.toolName,
    text: `обрезан харнессом: ≈${format(event.originalTokens)} → ≈${format(event.keptTokens)} токенов (лимит на результат ${format(event.limitTokens)})`,
  }),
  tool_results_cleared: (event) => ({
    code: null,
    text: `харнесс убрал старые результаты тулов (${String(event.cleared.length)}: ${event.cleared.map((item) => item.toolName).join(', ')}): prompt ≈${format(event.beforeTokens)} → ≈${format(event.afterTokens)}, порог ${format(event.thresholdTokens)}; начало prompt изменилось — кэш дальше не совпадёт`,
  }),
  history_compacted: (event) => ({
    code: null,
    text: `харнесс заменил прошлые ходы сводкой (${String(event.replacedMessages)} сообщений → 1): prompt ≈${format(event.beforeTokens)} → ≈${format(event.afterTokens)}; история с начала изменилась — кэш не совпадёт${describeRestored(event.restored)}`,
  }),
  skill_catalog: (event) => ({
    code: event.directory,
    text:
      event.skills.length === 0
        ? 'скиллов нет'
        : `каталог скиллов в system prompt: ${event.skills.map((skill) => skill.name).join(', ')}`,
  }),
  skill_loaded: (event) => ({ code: event.name, text: SKILL_TRIGGERS[event.trigger] }),
  memory_loaded: (event) => ({
    code: event.memoPath,
    text:
      event.memoCharacters === null
        ? 'памяти ещё нет — агент начинает с чистого листа'
        : `memo.md в system prompt: ${format(event.memoCharacters)} симв.`,
  }),
  memory_updated: (event) => ({
    code: event.newPath === null ? event.path : `${event.path} → ${event.newPath}`,
    text: `агент изменил память: ${event.command}`,
  }),
  progress_updated: (event) => ({
    code: event.path,
    text: `план v${String(event.version)}: ${event.goal} — сделано ${String(event.steps.filter((step) => step.status === 'done').length)} из ${String(event.steps.length)}`,
  }),
  assistant_message: (event) => ({ code: null, text: shorten(event.text) }),
  awaiting_question: (event) => ({
    code: null,
    text: `ход ${String(event.turn)} закончен — сессия ждёт следующего вопроса, история остаётся`,
  }),
  subagent_started: (event) => ({
    code: event.subagentId,
    text: `поручение субагенту: «${shorten(event.task, 160)}»`,
  }),
  subagent_finished: (event) => ({
    code: event.subagentId,
    text:
      event.status === 'done'
        ? `отчёт главному агенту — ${plural(event.modelRequests, REQUESTS)} к модели, input ${format(event.usage.inputTokens)}, ${seconds(event.durationMs)}`
        : `без отчёта: ${event.errorMessage ?? 'ошибка'}`,
  }),
  error: (event) => ({ code: null, text: `ошибка: ${event.message}` }),
};

// scope — чьи этапы: null — главного агента, иначе id субагента (этап 6c). Номера строк — по
// всем событиям записи, чтобы повтор отмечал пройденное одинаково у всех.
export function projectStages(
  events: readonly HarnessEvent[],
  scope: string | null = null,
): Stage[] {
  const first = events[0];
  const startedAt = first === undefined ? 0 : Date.parse(first.timestamp);
  const names = new Map<string, string>();
  const stages: Stage[] = [scope === null ? prepStage() : assignmentStage(events, scope)];
  events.forEach((event, index) => {
    if (!inScope(event, scope)) {
      return;
    }
    if (event.type === 'tool_call') {
      names.set(event.toolCallId, event.toolName);
    }
    openStageFor(stages, event, index, scope);
    const stage = stages.at(-1);
    if (stage !== undefined) {
      addRow(stage, event, { index, at: Date.parse(event.timestamp) - startedAt, names });
      noteRequest(stage, event);
    }
  });
  // Подготовка без строк — например, у трейса без запуска MCP — не показываем.
  return stages.filter((stage) => stage.rows.length > 0);
}

function prepStage(): Stage {
  return newStage(
    { id: 'prep', kind: 'prep', title: 'Подготовка', badge: 'до модели', requestId: null },
    0,
  );
}

// У субагента вместо подготовки — поручение, вместо ответа пользователю — отчёт главному.
function assignmentStage(events: readonly HarnessEvent[], scope: string): Stage {
  const started = events.findIndex(
    (event) => event.type === 'subagent_started' && event.subagentId === scope,
  );
  return newStage(
    {
      id: `${scope}-task`,
      kind: 'prep',
      title: 'Поручение',
      badge: 'delegate_task',
      requestId: null,
    },
    Math.max(0, started),
  );
}

// Начало и конец работы субагента — события главного агента, но и в его этапах они нужны.
function inScope(event: HarnessEvent, scope: string | null): boolean {
  if (scope === null) {
    return event.agentId === undefined;
  }
  if (event.type === 'subagent_started' || event.type === 'subagent_finished') {
    return event.subagentId === scope;
  }
  return event.agentId === scope;
}

interface RowPlace {
  index: number;
  at: number;
  names: Map<string, string>;
}

function addRow(stage: Stage, event: HarnessEvent, { index, at, names }: RowPlace): void {
  const describe = DESCRIBE[event.type] as
    | ((event: HarnessEvent, names: Map<string, string>) => Pick<StageRow, 'code' | 'text'> | null)
    | undefined;
  const row = describe?.(event, names);
  if (row) {
    stage.rows.push({ ...row, index, at, ...subagentOf(event) });
    stage.lastIndex = index;
  }
}

function subagentOf(event: HarnessEvent): Pick<StageRow, 'subagent'> {
  if (event.type === 'subagent_started') {
    return { subagent: { id: event.subagentId, edge: 'start' } };
  }
  if (event.type === 'subagent_finished') {
    return { subagent: { id: event.subagentId, edge: 'end' } };
  }
  return {};
}

// Запрос, который раскрывает «Подробнее»: у шага — свой; у подготовки и вопроса — первый
// служебный (переформулировка, сводка). Пометка шага — что ответила модель.
function noteRequest(stage: Stage, event: HarnessEvent): void {
  if (event.type === 'model_request' && event.purpose !== 'agentStep' && stage.requestId === null) {
    stage.requestId = event.requestId;
  }
  if (
    event.type === 'model_response' &&
    stage.kind === 'agent' &&
    stage.requestId === event.requestId
  ) {
    const calls = event.reply.toolCalls.length;
    stage.badge = calls > 0 ? `tool_calls: ${String(calls)}` : 'текст';
  }
}

// Шаг агента начинается запросом к модели, ответ пользователю — своим этапом, следующий вопрос
// диалога — своим. Номер хода — по числу вопросов: у второго вопроса заголовки «Вопрос 2 · …».
// У субагента (scope) последний этап — отчёт главному агенту.
function openStageFor(
  stages: Stage[],
  event: HarnessEvent,
  index: number,
  scope: string | null,
): void {
  const turn = stages.filter((stage) => stage.kind === 'question').length + 1;
  const head = stageHeadFor(event, { stages, turn, scope });
  if (head !== null) {
    stages.push(newStage(head, index));
  }
}

interface StagePlace {
  stages: Stage[];
  turn: number;
  scope: string | null;
}

function stageHeadFor(event: HarnessEvent, place: StagePlace): StageHead | null {
  const { turn, scope } = place;
  switch (event.type) {
    case 'subagent_finished':
      return scope === null ? null : reportHead(scope);
    case 'user_message':
      return place.stages.some((stage) => stage.kind === 'answer') ? questionHead(turn + 1) : null;
    case 'model_request':
      return event.purpose === 'agentStep' ? stepHead(event, place) : null;
    case 'assistant_message':
      return answerHead(turn);
    default:
      return null;
  }
}

function reportHead(scope: string): StageHead {
  return {
    id: `${scope}-report`,
    kind: 'answer',
    title: 'Отчёт главному агенту',
    badge: 'subagent_finished',
    requestId: null,
  };
}

function questionHead(turn: number): StageHead {
  return {
    id: `question-${String(turn)}`,
    kind: 'question',
    title: `Вопрос ${String(turn)}`,
    badge: 'user_message',
    requestId: null,
  };
}

function stepHead(event: EventOfType<'model_request'>, place: StagePlace): StageHead {
  const { turn, scope } = place;
  const step = String(event.iteration ?? place.stages.length);
  const prefix = turn > 1 ? `Вопрос ${String(turn)} · ` : '';
  const idPrefix = scope === null ? '' : `${scope}-`;
  return {
    id: `${idPrefix}turn-${String(turn)}-step-${step}`,
    kind: 'agent',
    title: `${prefix}Шаг ${step} · agentStep`,
    badge: 'модель думает…',
    requestId: event.requestId,
  };
}

function answerHead(turn: number): StageHead {
  return {
    id: `answer-${String(turn)}`,
    kind: 'answer',
    title: turn > 1 ? `Ответ на вопрос ${String(turn)}` : 'Ответ пользователю',
    badge: 'assistant_message',
    requestId: null,
  };
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
  compaction: ': сжать прошлые ходы в сводку',
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

function format(value: number): string {
  return value.toLocaleString('ru-RU');
}

function shorten(text: string, limit = 220): string {
  const line = text.replaceAll('\n', ' ');
  return line.length > limit ? `${line.slice(0, limit)}…` : line;
}

function seconds(ms: number): string {
  return `${(ms / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} с`;
}

const TOOLS = { one: 'тул', few: 'тула', many: 'тулов' };
const REQUESTS = { one: 'запрос', few: 'запроса', many: 'запросов' };
const MESSAGES = { one: 'message', few: 'messages', many: 'messages' };

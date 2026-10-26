// Действия сессии для «Потока» — то, что делают участники, а не отдельные события.
// exchange — обмен с длительностью: харнесс спросил модель и получил ответ, вызвал tool и получил
// результат, спросил пользователя и дождался ответа. message — сообщение в одну сторону.
// inside — событие внутри части харнесса: политика приняла решение, retrieval получил query.
//
// Действие строится из пары событий, поэтому у него есть настоящая длительность — именно её
// и показывает «Поток»: где сессия ждала и сколько. У действия маршрут — через кого идёт точка:
// вызов tool идёт из цикла через политику к исполнению, а тул MCP-сервера — дальше, к серверу.

import type { HarnessEvent, HarnessEventType } from '@harness-visualization/harness';
import type { EventGroup } from '../events/eventGroups';
import type { EventOfType } from '../events/eventTypes';
import type { FlowNodeId, Route } from '../features/flow/flowGraph';
import { plural } from '../text/plural';

export interface FlowAction {
  id: string;
  kind: 'exchange' | 'message' | 'inside';
  // Через кого идёт точка; from и to — концы маршрута. У inside маршрут из одной части.
  route: Route;
  // Обратный путь, если он длиннее прямого (в том же порядке, что route, — точка идёт по нему
  // с конца); null — обратно тем же маршрутом. Вызов tool уходит от политики, а результат
  // возвращается мимо неё в цикл.
  backRoute: Route | null;
  from: FlowNodeId;
  to: FlowNodeId;
  group: EventGroup;
  // Мс от начала записи. У exchange end — когда пришёл ответ; null — ответа ещё нет.
  start: number;
  end: number | null;
  // Номера событий начала и конца — чтобы упорядочить действия в одну миллисекунду.
  startSequence: number;
  endSequence: number | null;
  // Подписи на полосах «туда» и «обратно» и что делает адресат, пока ждём.
  out: string;
  back: string | null;
  busy: string | null;
  // Чьё действие: null — главного агента (или харнесса), иначе id субагента (этап 6c).
  agentId: string | null;
  // Подпись под схемой: что происходит в начале действия и в конце.
  what: string;
  detail: string;
  whatBack: string | null;
  detailBack: string | null;
  // Моменты фаз запроса к модели (этап 8d.3) от его начала; null — не запрос к модели
  // или ответ пришёл целиком (трейс до 8d.2).
  phases: ModelPhases | null;
}

export interface ModelPhases {
  firstMs: number;
  answerAtMs: number;
  lastMs: number;
  toolCalls: boolean;
}

export interface ActionContext {
  // Хост модели: его сетевые запросы уже показаны обменом с моделью.
  modelHost: string | null;
}

// Маршрут полосы: «туда» — route, «обратно» — backRoute, если он есть.
export function laneRoute(
  action: Pick<FlowAction, 'route' | 'backRoute'>,
  lane: 'out' | 'back',
): Route {
  return lane === 'back' ? (action.backRoute ?? action.route) : action.route;
}

// Тулы MCP-серверов харнесс называет «сервер__тул» (kedr__search).
export function isMcpTool(toolName: string): boolean {
  return toolName.includes('__');
}

export function modelHostOf(events: readonly HarnessEvent[]): string | null {
  const started = events.find((event) => event.type === 'session_started');
  if (started?.type !== 'session_started') {
    return null;
  }
  try {
    // hostname, без порта: в network_request хост записан без него.
    return new URL(started.baseUrl).hostname;
  } catch {
    return null;
  }
}

// searchapi.api.cloud.yandex.net → yandex.net: на схеме хватает домена.
export function shortHost(host: string): string {
  return host.split('.').slice(-2).join('.');
}

interface Builder {
  actions: FlowAction[];
  // Открытые обмены: model:<requestId>, tool:<toolCallId>, question:<toolCallId>, mcp:<server>…
  open: Map<string, FlowAction>;
  context: ActionContext;
}

// Событие и его время от начала записи.
interface Origin {
  event: HarnessEvent;
  at: number;
}

type Handlers = {
  [Type in HarnessEventType]?: (builder: Builder, event: EventOfType<Type>, at: number) => void;
};

const HANDLERS: Handlers = {
  mcp_server_starting: (builder, event, at) => {
    openExchange(
      builder,
      `mcp:${event.serverName}`,
      { event, at },
      {
        route: ['tools', 'mcp'],
        group: 'meta',
        out: 'initialize · tools/list',
        busy: 'запускается…',
        what: 'Харнесс подключает MCP-сервер',
        detail: `${event.serverName}: ${event.command} ${event.args.join(' ')}`,
      },
    );
  },
  mcp_server_ready: (builder, event, at) => {
    closeExchange(
      builder,
      `mcp:${event.serverName}`,
      { event, at },
      {
        back: plural(event.tools.length, TOOLS),
        whatBack: 'MCP-сервер готов',
        detailBack: `${event.serverName}: ${plural(event.tools.length, TOOLS)} за ${String(event.durationMs)} мс`,
      },
    );
  },
  mcp_server_failed: (builder, event, at) => {
    closeExchange(
      builder,
      `mcp:${event.serverName}`,
      { event, at },
      {
        back: 'ошибка',
        whatBack: 'MCP-сервер не запустился',
        detailBack: event.message,
      },
    );
  },
  user_message: (builder, event, at) => {
    // Следующий вопрос диалога закрывает ожидание: пользователь читал ответ и спросил ещё.
    const reading = findOpen(builder, 'reading:');
    if (reading !== null) {
      closeExchange(
        builder,
        reading,
        { event, at },
        {
          back: 'вопрос',
          whatBack: 'Пользователь спрашивает ещё',
          detailBack: `«${event.text}»`,
        },
      );
      return;
    }
    addAction(
      builder,
      { event, at },
      {
        kind: 'message',
        route: ['user', 'loop'],
        group: 'dialog',
        out: 'вопрос',
        what: 'Пользователь спрашивает',
        detail: `«${event.text}»`,
      },
    );
  },
  assistant_message: (builder, event, at) => {
    // Ответ отдан — пользователь читает его и, может быть, спросит ещё (диалог, этап 6.1).
    // Если вопроса так и не будет, в конце это станет просто сообщением.
    openExchange(
      builder,
      `reading:${String(event.sequence)}`,
      { event, at },
      {
        route: ['loop', 'user'],
        group: 'dialog',
        out: 'ответ',
        busy: 'читает ответ…',
        what: 'Пользователь получает ответ',
        detail: 'полный ответ — в колонке «Диалог»',
      },
    );
  },
  prompt_assembled: (builder, event, at) => {
    // Сборка мгновенна, но это своя часть харнесса: цикл просит, контекст отдаёт prompt.
    const key = `prompt:${String(event.sequence)}`;
    openExchange(
      builder,
      key,
      { event, at },
      {
        route: ['loop', 'context'],
        group: 'model',
        out: 'собрать prompt',
        busy: 'собирает…',
        what: 'Харнесс собирает prompt',
        detail: 'system prompt, история диалога, результаты и описания тулов',
      },
    );
    closeExchange(
      builder,
      key,
      { event, at },
      {
        back: `${String(event.messages.length)} messages · ${String(event.toolNames.length)} tools`,
        whatBack: 'Prompt собран',
        detailBack: `${plural(event.messages.length, MESSAGES)} и описания ${plural(event.toolNames.length, TOOLS)}`,
      },
    );
  },
  query_rewritten: (builder, event, at) => {
    addInside(
      builder,
      { event, at },
      {
        node: 'retrieval',
        group: 'retrieval',
        out: `query: ${event.query}`,
        what: 'Харнесс получил поисковый query',
        detail: `«${event.userQuestion}» → «${event.query}»`,
      },
    );
  },
  context_retrieved: (builder, event, at) => {
    // Событие пишется по окончании поиска; начало — на durationMs раньше.
    const key = `retrieval:${String(event.sequence)}`;
    openExchange(
      builder,
      key,
      { event, at: at - event.durationMs },
      {
        route: ['loop', 'retrieval', 'mcp'],
        group: 'retrieval',
        out: `поиск харнесса · ${event.toolName}`,
        busy: 'ищет…',
        what: 'Харнесс ищет сам, до первого запроса к модели',
        detail: `${event.toolName}, query от ${event.queryAuthor}`,
      },
    );
    closeExchange(
      builder,
      key,
      { event, at },
      {
        back: event.status === 'success' ? 'подмешано в контекст' : 'ошибка',
        whatBack: 'Найденное подмешано в контекст',
        detailBack: `${event.status}, ${String(event.durationMs)} мс`,
      },
    );
  },
  model_request: (builder, event, at) => {
    openExchange(builder, `model:${event.requestId}`, { event, at }, describeModelRequest(event));
  },
  model_response: (builder, event, at) => {
    const action = builder.open.get(`model:${event.requestId}`);
    closeExchange(builder, `model:${event.requestId}`, { event, at }, describeModelResponse(event));
    if (action !== undefined) {
      action.phases = modelPhases(event);
    }
  },
  model_error: (builder, event, at) => {
    closeExchange(
      builder,
      `model:${event.requestId}`,
      { event, at },
      {
        back: 'ошибка',
        whatBack: 'Модель ответила ошибкой',
        detailBack: event.message,
      },
    );
  },
  tool_call: (builder, event, at) => {
    const mcp = isMcpTool(event.toolName);
    // Сначала вызов доходит до политики — она решает, пока точка стоит у неё; к исполнению
    // он уходит уже от политики, а результат возвращается в цикл.
    addAction(
      builder,
      { event, at },
      {
        kind: 'message',
        route: ['loop', 'policy'],
        group: 'tool',
        out: event.toolName,
        what: 'Цикл передаёт вызов политике',
        detail: shorten(event.argumentsText),
      },
    );
    const route = toolRoute(event.toolName, mcp);
    openExchange(
      builder,
      `tool:${event.toolCallId}`,
      { event, at },
      {
        route,
        group: 'tool',
        out: event.toolName,
        busy: toolBusy(event.toolName),
        what: toolWhat(event.toolName, mcp),
        detail: shorten(event.argumentsText),
      },
    );
    const action = builder.open.get(`tool:${event.toolCallId}`);
    if (action !== undefined) {
      Object.assign(action, { from: 'loop', backRoute: ['loop', ...route] });
    }
  },
  permission_evaluated: (builder, event, at) => {
    addInside(
      builder,
      { event, at },
      {
        node: 'policy',
        group: 'permission',
        out: event.decision,
        what: 'Политика решает, можно ли выполнить',
        detail: event.reason,
      },
    );
    // Tool уходит к адресату только после решения: сдвигаем начало обмена сюда.
    delayStart(builder, `tool:${event.toolCallId}`, { event, at });
  },
  permission_requested: (builder, event, at) => {
    openExchange(
      builder,
      `question:${event.toolCallId}`,
      { event, at },
      {
        route: ['policy', 'loop', 'user'],
        group: 'permission',
        out: 'разрешить?',
        busy: 'решает…',
        what: 'Харнесс спрашивает разрешение',
        detail: event.actionDescription,
      },
    );
  },
  permission_resolved: (builder, event, at) => {
    closeExchange(
      builder,
      `question:${event.toolCallId}`,
      { event, at },
      {
        back: describeAnswer(event),
        whatBack:
          event.answeredBy === 'user'
            ? 'Пользователь ответил'
            : 'Ответа не было — действие запрещено',
        detailBack: `answeredBy ${event.answeredBy}, ждали ${String(event.waitedForUserMs)} мс`,
      },
    );
    delayStart(builder, `tool:${event.toolCallId}`, { event, at });
  },
  tool_result: (builder, event, at) => {
    closeTool(builder, event, at);
  },
  iteration_limit_reached: (builder, event, at) => {
    addInside(
      builder,
      { event, at },
      {
        node: 'loop',
        group: 'model',
        out: `лимит ${String(event.limit)} шагов`,
        what: 'Лимит шагов: харнесс просит ответить по найденному',
        detail: `последний шаг — тулы описаны, но звать их нельзя (tool_choice: none); ${event.setting}`,
      },
    );
  },
  tool_result_truncated: (builder, event, at) => {
    // Результат кладётся в историю — тут харнесс и обрезает его: часть «Контекст и prompt».
    addInside(
      builder,
      { event, at },
      {
        node: 'context',
        group: 'model',
        out: `обрезано: ≈${String(event.originalTokens)} → ≈${String(event.keptTokens)}`,
        what: 'Харнесс обрезал результат тула',
        detail: `${event.toolName}: в историю — начало и пометка; лимит на результат ${String(event.limitTokens)} токенов (${event.preset})`,
      },
    );
  },
  tool_results_cleared: (builder, event, at) => {
    addInside(
      builder,
      { event, at },
      {
        node: 'context',
        group: 'model',
        out: `убрано: ${String(event.cleared.length)} · ≈${String(event.beforeTokens)} → ≈${String(event.afterTokens)}`,
        what: 'Харнесс убрал старые результаты тулов',
        detail: `prompt дорос до порога ${String(event.thresholdTokens)} — вместо результатов заглушки; начало prompt изменилось, кэш дальше не совпадёт`,
      },
    );
  },
  history_compacted: (builder, event, at) => {
    addInside(
      builder,
      { event, at },
      {
        node: 'context',
        group: 'model',
        out: `сводка: ${String(event.replacedMessages)} → 1 · ≈${String(event.beforeTokens)} → ≈${String(event.afterTokens)}`,
        what: 'Харнесс заменил прошлые ходы сводкой',
        detail:
          'история с начала изменилась — кэш prompt после system и описаний тулов не совпадёт',
      },
    );
  },
  skill_catalog: (builder, event, at) => {
    if (event.skills.length === 0) {
      return;
    }
    addInside(
      builder,
      { event, at },
      {
        node: 'context',
        group: 'model',
        out: `скиллы: ${String(event.skills.length)}`,
        what: 'Каталог скиллов — в system prompt',
        detail: `имя и описание: ${event.skills.map((skill) => skill.name).join(', ')}; инструкцию модель загрузит сама`,
      },
    );
  },
  // Ветка (этап 9): шаги до точки ветвления — replay из записи; их событий в трейсе ветки нет,
  // поэтому в плеере они — одно действие у «Контекста»: история пришла из чужого трейса.
  branch_started: (builder, event, at) => {
    addInside(
      builder,
      { event, at },
      {
        node: 'context',
        group: 'meta',
        out:
          event.replayedSteps === 0 ? 'ветка с шага 1' : `replay 1–${String(event.replayedSteps)}`,
        what:
          event.replayedSteps === 0
            ? 'Ветка с шага 1 — новый прогон'
            : `Replay: шаги 1–${String(event.replayedSteps)} из трейса ${event.sourceSessionId ?? ''}`,
        detail: `${String(event.replayedMessages)} сообщений истории без запросов к модели и тулов; с шага ${String(event.step)} — новый прогон`,
      },
    );
  },
  memory_loaded: (builder, event, at) => {
    addInside(
      builder,
      { event, at },
      {
        node: 'context',
        group: 'model',
        out: event.memoCharacters === null ? 'памяти нет' : 'memo.md',
        what:
          event.memoCharacters === null
            ? 'Памяти ещё нет'
            : 'Память с прошлых сессий — в system prompt',
        detail:
          event.memoCharacters === null
            ? `${event.memoPath} появится, когда агент что-то запомнит`
            : `${event.memoPath}: ${String(event.memoCharacters)} симв.`,
      },
    );
  },
  skill_loaded: (builder, event, at) => {
    // Загрузку моделью видно вызовом load_skill; здесь — загрузки без тула.
    if (event.trigger === 'model') {
      return;
    }
    addInside(
      builder,
      { event, at },
      {
        node: 'context',
        group: 'model',
        out: `скилл ${event.name}`,
        what:
          event.trigger === 'user'
            ? 'Пользователь загрузил скилл командой'
            : 'Скилл always — в system prompt',
        detail: `инструкция ${event.name} — в prompt`,
      },
    );
  },
  network_request: (builder, event, at) => {
    if (event.host === builder.context.modelHost) {
      return;
    }
    openExchange(
      builder,
      `network:${String(event.sequence)}`,
      { event, at },
      {
        route: ['tools', 'network'],
        group: 'tool',
        out: `${shortHost(event.host)} · ${event.viaProxy ? 'прокси' : 'напрямую'}`,
        busy: 'отвечает…',
        what: 'Тулы идут в интернет',
        detail: `${event.host}, ${event.viaProxy ? `через прокси ${event.proxyUrl ?? ''}` : 'напрямую'}`,
      },
    );
  },
  error: (builder, event, at) => {
    addInside(
      builder,
      { event, at },
      {
        node: 'loop',
        group: 'error',
        out: 'ошибка',
        what: 'Сессия завершилась ошибкой',
        detail: event.message,
      },
    );
  },
};

// Куда уходит вызов от исполнения: к MCP-серверу, к процессу тестов (Код-арена, этап 10)
// или никуда — свой тул выполняется внутри харнесса.
function toolRoute(toolName: string, mcp: boolean): Route {
  if (toolName === 'run_tests' || toolName === 'run_node') {
    return ['policy', 'tools', 'sandbox'];
  }
  return mcp ? ['policy', 'tools', 'mcp'] : ['policy', 'tools'];
}

function toolBusy(toolName: string): string {
  if (toolName === 'run_tests') {
    return 'гоняет тесты…';
  }
  if (toolName === 'run_node') {
    return 'выполняет программу…';
  }
  return delegates(toolName) ? 'работает субагент…' : 'выполняет…';
}

function modelPhases(event: EventOfType<'model_response'>): ModelPhases | null {
  const timing = event.timing ?? null;
  if (timing === null || timing.firstTokenMs === null) {
    return null;
  }
  const answerAtMs = timing.firstAnswerTokenMs ?? timing.firstTokenMs;
  return {
    firstMs: timing.firstTokenMs,
    answerAtMs,
    lastMs: timing.lastTokenMs ?? answerAtMs,
    toolCalls: event.reply.toolCalls.length > 0,
  };
}

// delegate_task (этап 6c): тул выполняет целый субагент — его запросы к модели и тулы идут
// своими действиями, подписанными его id.
function delegates(toolName: string): boolean {
  return toolName === 'delegate_task';
}

function toolWhat(toolName: string, mcp: boolean): string {
  if (delegates(toolName)) {
    return 'Харнесс запускает субагента — он работает в своей истории';
  }
  if (toolName === 'run_tests') {
    return 'Харнесс запускает тесты в отдельном процессе Node — код в нём написала модель';
  }
  if (toolName === 'run_node') {
    return 'Харнесс запускает программу агента в отдельном процессе Node';
  }
  return mcp ? `MCP-сервер выполняет ${toolName}` : `Харнесс выполняет ${toolName}`;
}

// Действия субагента — по тем же частям схемы, но подпись говорит, чьи они.
function markAgent(actions: FlowAction[], from: number, agentId: string | undefined): void {
  if (agentId === undefined) {
    return;
  }
  for (const action of actions.slice(from)) {
    action.agentId = agentId;
    action.what = `Субагент ${agentId}: ${action.what}`;
  }
}

function markAgentBack(action: FlowAction | undefined, agentId: string | undefined): void {
  if (action !== undefined && action.whatBack !== null && agentId !== undefined) {
    action.whatBack = `Субагент ${agentId}: ${action.whatBack}`;
  }
}

export function buildActions(
  events: readonly HarnessEvent[],
  context: ActionContext,
): FlowAction[] {
  const first = events[0];
  const startedAt = first === undefined ? 0 : Date.parse(first.timestamp);
  const builder: Builder = { actions: [], open: new Map(), context };
  for (const event of events) {
    // TypeScript не связывает тип события с ключом таблицы сам — помогаем приведением.
    const handle = HANDLERS[event.type] as
      ((builder: Builder, event: HarnessEvent, at: number) => void) | undefined;
    const before = builder.actions.length;
    const closing = closingAction(builder, event);
    handle?.(builder, event, Date.parse(event.timestamp) - startedAt);
    markAgent(builder.actions, before, event.agentId);
    markAgentBack(closing, event.agentId);
  }
  settleReading(builder, events.at(-1));
  return builder.actions;
}

// Обмен, который закроет это событие, — чтобы подписать и его обратную полосу.
function closingAction(builder: Builder, event: HarnessEvent): FlowAction | undefined {
  if (event.type === 'model_response' || event.type === 'model_error') {
    return builder.open.get(`model:${event.requestId}`);
  }
  if (event.type === 'tool_result') {
    return builder.open.get(`tool:${event.toolCallId}`);
  }
  return undefined;
}

// Последний ответ: сессия ждёт вопроса — пользователь «читает» и дальше; иначе вопроса уже
// не будет, и ответ — обычное сообщение, без ожидания у пользователя.
function settleReading(builder: Builder, last: HarnessEvent | undefined): void {
  const key = findOpen(builder, 'reading:');
  if (key === null || last?.type === 'awaiting_question') {
    return;
  }
  const action = builder.open.get(key);
  if (action !== undefined) {
    Object.assign(action, { kind: 'message', busy: null });
  }
  builder.open.delete(key);
}

function findOpen(builder: Builder, prefix: string): string | null {
  return [...builder.open.keys()].find((key) => key.startsWith(prefix)) ?? null;
}

type ExchangeStart = Pick<FlowAction, 'route' | 'group' | 'out' | 'busy' | 'what' | 'detail'>;
type ExchangeEnd = Pick<FlowAction, 'back' | 'whatBack' | 'detailBack'>;
type ActionSpec = Pick<FlowAction, 'kind' | 'route' | 'group' | 'out' | 'what' | 'detail'>;

interface InsideSpec extends Pick<FlowAction, 'group' | 'out' | 'what' | 'detail'> {
  // В какой части харнесса это происходит.
  node: FlowNodeId;
}

function addAction(
  builder: Builder,
  { event, at }: Origin,
  spec: ActionSpec,
  id?: string,
): FlowAction {
  const action: FlowAction = {
    ...spec,
    from: spec.route[0] ?? 'loop',
    to: spec.route.at(-1) ?? 'loop',
    backRoute: null,
    agentId: null,
    id: id ?? `${spec.kind}:${String(event.sequence)}`,
    start: at,
    end: null,
    startSequence: event.sequence,
    endSequence: null,
    back: null,
    busy: null,
    whatBack: null,
    detailBack: null,
    phases: null,
  };
  builder.actions.push(action);
  return action;
}

function addInside(builder: Builder, origin: Origin, { node, ...spec }: InsideSpec): void {
  addAction(builder, origin, { ...spec, kind: 'inside', route: [node] });
}

function openExchange(builder: Builder, key: string, origin: Origin, start: ExchangeStart): void {
  const action = addAction(builder, origin, { ...start, kind: 'exchange' }, key);
  action.busy = start.busy;
  builder.open.set(key, action);
}

function closeExchange(
  builder: Builder,
  key: string,
  { event, at }: Origin,
  end: ExchangeEnd,
): void {
  const action = builder.open.get(key);
  if (action === undefined) {
    return;
  }
  Object.assign(action, end, { end: at, endSequence: event.sequence });
  builder.open.delete(key);
}

function delayStart(builder: Builder, key: string, { event, at }: Origin): void {
  const action = builder.open.get(key);
  if (action !== undefined) {
    action.start = at;
    action.startSequence = event.sequence;
  }
}

function closeTool(builder: Builder, event: EventOfType<'tool_result'>, at: number): void {
  if (!isMcpTool(event.toolName)) {
    closeNetwork(builder, { event, at });
  }
  const key = `tool:${event.toolCallId}`;
  const action = builder.open.get(key);
  if (action !== undefined && (event.status === 'denied' || event.status === 'blocked')) {
    // Запрещённый tool дальше политики не ушёл: это решение внутри харнесса.
    Object.assign(action, {
      kind: 'inside',
      route: ['policy'],
      backRoute: null,
      from: 'policy',
      to: 'policy',
      group: 'permission',
      out: `${event.toolName}: ${event.status}`,
      busy: null,
      what: 'Вызов не выполнен',
      detail: shorten(event.content),
    });
    builder.open.delete(key);
    return;
  }
  closeExchange(
    builder,
    key,
    { event, at },
    {
      back: `${event.status} · ${String(event.durationMs)} мс`,
      whatBack: `Результат ${event.toolName}`,
      detailBack: shorten(event.content),
    },
  );
}

// Интернет ответил — его обмены закрываются вместе с tool, который в него ходил.
function closeNetwork(builder: Builder, origin: Origin): void {
  for (const [key, network] of builder.open) {
    if (key.startsWith('network:')) {
      closeExchange(builder, key, origin, {
        back: 'ответ',
        whatBack: 'Интернет ответил',
        detailBack: network.detail,
      });
    }
  }
}

function describeModelRequest(event: EventOfType<'model_request'>): ExchangeStart {
  const base = { route: ['loop', 'model'], busy: 'думает…' } as const;
  const step = String(event.iteration ?? '?');
  switch (event.purpose) {
    case 'agentStep':
      return {
        ...base,
        group: 'model',
        out: `prompt · шаг ${step}`,
        what: `Модель думает над шагом ${step}`,
        detail: 'запрос с полным контекстом: prompt, история, результаты тулов',
      };
    case 'queryRewrite':
      // Retrieval спрашивает модель сам, мимо цикла агента.
      return {
        ...base,
        route: ['retrieval', 'model'],
        group: 'retrieval',
        out: 'query rewrite',
        what: 'Модель переформулирует вопрос в поисковый query',
        detail: 'служебный запрос харнесса, не шаг агента',
      };
    case 'groundingJudge':
      return {
        ...base,
        group: 'judge',
        out: 'вопрос судье',
        what: 'Судья оценивает claim ответа',
        detail: 'служебный запрос харнесса, не шаг агента',
      };
    case 'evalJudge':
      return {
        ...base,
        group: 'judge',
        out: 'вопрос судье',
        what: 'Судья evals сверяет ответ с рубрикой задачи',
        detail: 'служебный запрос харнесса, не шаг агента',
      };
    case 'tokenLab':
      return {
        ...base,
        group: 'model',
        out: 'logprobs',
        what: 'Модель отвечает и отдаёт вероятности токенов',
        detail: 'запрос лаборатории «Выбор токена»: без тулов, с logprobs и заданной температурой',
      };
    case 'compaction':
      // Сводку заказывает часть «Контекст и prompt» — через тот же клиент модели, что у цикла.
      return {
        ...base,
        route: ['context', 'loop', 'model'],
        busy: 'пишет сводку…',
        group: 'model',
        out: 'сжать историю',
        what: 'Модель сжимает прошлые ходы в сводку',
        detail:
          'служебный запрос харнесса: prompt дорос до порога, а очистки результатов тулов не хватило',
      };
  }
}

function describeModelResponse(event: EventOfType<'model_response'>): ExchangeEnd {
  const { usage, toolCalls, finishReason } = event.reply;
  const share =
    usage.inputTokens === 0 ? 0 : Math.round((usage.inputCacheHitTokens / usage.inputTokens) * 100);
  const seconds = (event.durationMs / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 });
  return {
    back: toolCalls.length > 0 ? `tool_calls: ${String(toolCalls.length)}` : 'текст',
    whatBack:
      toolCalls.length > 0
        ? `Модель просит ${plural(toolCalls.length, TOOLS)}`
        : `Модель ответила (${finishReason})`,
    detailBack: `${usage.inputTokens.toLocaleString('ru-RU')} input tokens, из кэша ${String(share)} % · output ${usage.outputTokens.toLocaleString('ru-RU')} · ${seconds} с`,
  };
}

function describeAnswer(event: EventOfType<'permission_resolved'>): string {
  if (event.answeredBy === 'user') {
    return event.approved ? 'да' : 'нет';
  }
  return event.answeredBy === 'timeout' ? 'нет ответа' : 'спросить некого';
}

function shorten(text: string, limit = 140): string {
  const line = text.replaceAll('\n', ' ');
  return line.length > limit ? `${line.slice(0, limit)}…` : line;
}

const TOOLS = { one: 'тул', few: 'тула', many: 'тулов' };
const MESSAGES = { one: 'message', few: 'messages', many: 'messages' };

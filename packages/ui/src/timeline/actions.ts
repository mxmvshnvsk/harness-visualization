// Действия сессии для «Потока» — то, что делают участники, а не отдельные события.
// exchange — обмен с длительностью: харнесс спросил модель и получил ответ, вызвал tool и получил
// результат, спросил пользователя и дождался ответа. message — сообщение в одну сторону.
// inside — событие внутри участника: харнесс собрал prompt, политика приняла решение.
//
// Действие строится из пары событий, поэтому у него есть настоящая длительность — именно её
// и показывает «Поток»: где сессия ждала и сколько.

import type { HarnessEvent, HarnessEventType } from '@harness-visualization/harness';
import type { EventGroup } from '../events/eventGroups';
import type { EventOfType } from '../events/eventTypes';
import type { FlowNodeId } from '../features/flow/flowGraph';
import { plural } from '../text/plural';

export interface FlowAction {
  id: string;
  kind: 'exchange' | 'message' | 'inside';
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
  // Подпись под схемой: что происходит в начале действия и в конце.
  what: string;
  detail: string;
  whatBack: string | null;
  detailBack: string | null;
}

export interface ActionContext {
  // Хост модели: его сетевые запросы уже показаны обменом с моделью.
  modelHost: string | null;
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
    return new URL(started.baseUrl).host;
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
        from: 'harness',
        to: 'mcp',
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
    addAction(
      builder,
      { event, at },
      {
        kind: 'message',
        from: 'user',
        to: 'harness',
        group: 'dialog',
        out: 'вопрос',
        what: 'Пользователь спрашивает',
        detail: `«${event.text}»`,
      },
    );
  },
  assistant_message: (builder, event, at) => {
    addAction(
      builder,
      { event, at },
      {
        kind: 'message',
        from: 'harness',
        to: 'user',
        group: 'dialog',
        out: 'ответ',
        what: 'Пользователь получает ответ',
        detail: shorten(event.text),
      },
    );
  },
  prompt_assembled: (builder, event, at) => {
    addInside(
      builder,
      { event, at },
      {
        group: 'model',
        out: `prompt: ${String(event.messages.length)} messages · ${String(event.toolNames.length)} tools`,
        what: 'Харнесс собирает prompt',
        detail: `${plural(event.messages.length, MESSAGES)} и описания ${plural(event.toolNames.length, TOOLS)}`,
      },
    );
  },
  query_rewritten: (builder, event, at) => {
    addInside(
      builder,
      { event, at },
      {
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
        from: 'harness',
        to: 'mcp',
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
    closeExchange(builder, `model:${event.requestId}`, { event, at }, describeModelResponse(event));
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
    openExchange(
      builder,
      `tool:${event.toolCallId}`,
      { event, at },
      {
        from: 'harness',
        to: mcp ? 'mcp' : 'tools',
        group: 'tool',
        out: event.toolName,
        busy: 'выполняет…',
        what: mcp
          ? `MCP-сервер выполняет ${event.toolName}`
          : `Харнесс выполняет ${event.toolName}`,
        detail: shorten(event.argumentsText),
      },
    );
  },
  permission_evaluated: (builder, event, at) => {
    addInside(
      builder,
      { event, at },
      {
        group: 'permission',
        out: `политика: ${event.decision}`,
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
        from: 'harness',
        to: 'user',
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
  network_request: (builder, event, at) => {
    if (event.host === builder.context.modelHost) {
      return;
    }
    openExchange(
      builder,
      `network:${String(event.sequence)}`,
      { event, at },
      {
        from: 'tools',
        to: 'network',
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
        group: 'error',
        out: 'ошибка',
        what: 'Сессия завершилась ошибкой',
        detail: event.message,
      },
    );
  },
};

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
    handle?.(builder, event, Date.parse(event.timestamp) - startedAt);
  }
  return builder.actions;
}

type ExchangeStart = Pick<FlowAction, 'from' | 'to' | 'group' | 'out' | 'busy' | 'what' | 'detail'>;
type ExchangeEnd = Pick<FlowAction, 'back' | 'whatBack' | 'detailBack'>;
type ActionSpec = Pick<FlowAction, 'kind' | 'from' | 'to' | 'group' | 'out' | 'what' | 'detail'>;

function addAction(
  builder: Builder,
  { event, at }: Origin,
  spec: ActionSpec,
  id?: string,
): FlowAction {
  const action: FlowAction = {
    ...spec,
    id: id ?? `${spec.kind}:${String(event.sequence)}`,
    start: at,
    end: null,
    startSequence: event.sequence,
    endSequence: null,
    back: null,
    busy: null,
    whatBack: null,
    detailBack: null,
  };
  builder.actions.push(action);
  return action;
}

function addInside(
  builder: Builder,
  origin: Origin,
  spec: Pick<FlowAction, 'group' | 'out' | 'what' | 'detail'>,
): void {
  addAction(builder, origin, { ...spec, kind: 'inside', from: 'harness', to: 'harness' });
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
    // Запрещённый tool никуда не ходил: это решение внутри харнесса.
    Object.assign(action, {
      kind: 'inside',
      from: 'harness',
      to: 'harness',
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
  const base = { from: 'harness', to: 'model', busy: 'думает…' } as const;
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
      return {
        ...base,
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

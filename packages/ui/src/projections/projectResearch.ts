// Режим «Исследование» (по мокапу, одобренному автором 26.10.2026): сессия — список запросов
// к модели. У каждого — что ушло (тело запроса, заголовки, маршрут), что пришло (тело ответа,
// разобранный ответ, usage, цена) и что случилось между этим запросом и следующим: вызовы тулов,
// решения политики, очистки и сжатия контекста. Снимок контекста строит экран из тела запроса.

import type { HarnessEvent } from '@harness-visualization/harness';

type EventOf<Type extends HarnessEvent['type']> = Extract<HarnessEvent, { type: Type }>;

export interface ResearchNote {
  // Номер события — клик по строке перематывает плеер к нему.
  index: number;
  type: HarnessEvent['type'];
  text: string;
}

export interface ResearchStep {
  number: number;
  // Номер события model_request.
  index: number;
  agentId: string | null;
  // «шаг 3», «сводка», «судья» — как запрос называется на экране.
  label: string;
  request: EventOf<'model_request'>;
  response: EventOf<'model_response'> | null;
  error: EventOf<'model_error'> | null;
  network: EventOf<'network_request'> | null;
  // Предыдущий запрос того же агента — с ним по умолчанию сравнивается контекст.
  previous: number | null;
  notes: ResearchNote[];
}

export interface ResearchView {
  // События до первого запроса: вопрос, подготовка, поиск харнесса.
  before: ResearchNote[];
  steps: ResearchStep[];
}

export function projectResearch(events: readonly HarnessEvent[], shown: number): ResearchView {
  const view: ResearchView = { before: [], steps: [] };
  const lastOfAgent = new Map<string, number>();
  events.slice(0, shown).forEach((event, index) => {
    if (event.type === 'model_request') {
      const agent = event.agentId ?? '';
      view.steps.push(newStep(event, index, view.steps.length, lastOfAgent.get(agent) ?? null));
      lastOfAgent.set(agent, view.steps.length - 1);
      return;
    }
    const step = attach(view, event);
    const note = noteOf(event, index);
    if (!step && note !== null) {
      (view.steps.at(-1)?.notes ?? view.before).push(note);
    }
  });
  return view;
}

function newStep(
  request: EventOf<'model_request'>,
  index: number,
  position: number,
  previous: number | null,
): ResearchStep {
  return {
    number: position + 1,
    index,
    agentId: request.agentId ?? null,
    label: labelOf(request),
    request,
    response: null,
    error: null,
    network: null,
    previous,
    notes: [],
  };
}

// Ответ, ошибка и сетевой маршрут — к своему запросу, а не строкой между шагами.
function attach(view: ResearchView, event: HarnessEvent): boolean {
  if (event.type === 'model_response' || event.type === 'model_error') {
    const step = view.steps.find((item) => item.request.requestId === event.requestId);
    if (step !== undefined) {
      if (event.type === 'model_response') {
        step.response = event;
      } else {
        step.error = event;
      }
      return true;
    }
  }
  if (event.type === 'network_request') {
    const step = view.steps.at(-1);
    if (step !== undefined && step.network === null && step.response === null) {
      step.network = event;
      return true;
    }
  }
  return false;
}

const PURPOSE_LABELS: Record<EventOf<'model_request'>['purpose'], string> = {
  agentStep: 'шаг',
  queryRewrite: 'переформулировка',
  groundingJudge: 'судья опоры',
  compaction: 'сводка',
  evalJudge: 'судья evals',
  tokenLab: 'logprobs',
};

function labelOf(request: EventOf<'model_request'>): string {
  const base = PURPOSE_LABELS[request.purpose];
  return request.purpose === 'agentStep' && request.iteration !== null
    ? `${base} ${String(request.iteration)}`
    : base;
}

type Describe<Type extends HarnessEvent['type']> = (event: EventOf<Type>) => string;

// Строки между шагами: коротко и с цифрами; остальные события в таблицу шагов не попадают.
const DESCRIBERS: { [Type in HarnessEvent['type']]?: Describe<Type> } = {
  user_message: (event) => `вопрос: ${shorten(event.text)}`,
  context_retrieved: (event) =>
    `поиск харнесса ${event.toolName}: ${event.status === 'success' ? `${String(event.content.length)} симв.` : 'ошибка'}`,
  tool_call: (event) => `tool_call ${event.toolName} ${shorten(event.argumentsText, 70)}`,
  permission_evaluated: (event) => `политика ${event.toolName} → ${event.decision}`,
  permission_resolved: (event) =>
    `разрешение ${event.toolName}: ${event.approved ? 'да' : 'нет'} (${event.answeredBy})`,
  tool_result: (event) =>
    `tool_result ${event.toolName} · ${event.status} · ${String(event.content.length)} симв. · ${String(event.durationMs)} мс`,
  tool_result_truncated: (event) =>
    `обрезка ${event.toolName}: ${String(event.originalTokens)} → ${String(event.keptTokens)} ток.`,
  tool_results_cleared: (event) =>
    `очистка: ${String(event.cleared.length)} результатов · ${String(event.beforeTokens)} → ${String(event.afterTokens)} ток.`,
  history_compacted: (event) =>
    `компакция: ${String(event.beforeTokens)} → ${String(event.afterTokens)} ток.`,
  skill_loaded: (event) => `скилл ${event.name}`,
  subagent_started: (event) =>
    `субагент ${event.subagentId} (${event.agent}): ${shorten(event.task)}`,
  subagent_finished: (event) => `субагент ${event.subagentId} → ${event.status}`,
  iteration_limit_reached: (event) => `лимит шагов ${String(event.limit)}`,
  assistant_message: (event) => `ответ: ${shorten(event.text)}`,
  error: (event) => `ошибка: ${shorten(event.message)}`,
  acceptance_checked: (event) => `приёмка: ${event.passed ? 'пройдена' : 'не пройдена'}`,
};

function noteOf(event: HarnessEvent, index: number): ResearchNote | null {
  // Тип события и его описателя TypeScript не связывает сам — проверено по ключу таблицы.
  const describe = DESCRIBERS[event.type] as ((value: HarnessEvent) => string) | undefined;
  if (describe === undefined) {
    return null;
  }
  const text = describe(event);
  return {
    index,
    type: event.type,
    text: event.agentId === undefined ? text : `[${event.agentId}] ${text}`,
  };
}

function shorten(text: string, limit = 90): string {
  const line = text.replace(/\s+/gu, ' ').trim();
  return line.length <= limit ? line : `${line.slice(0, limit - 1)}…`;
}

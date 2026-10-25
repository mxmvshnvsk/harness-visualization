// Ходы диалога для колонки «Диалог» (этап 6.1): вопрос, ответ и итог хода. Строятся из всех
// событий сразу; повтор показывает только то, до чего дошёл (номера событий askedIndex и
// answeredIndex сравниваются с числом показанных).

import type { HarnessEvent } from '@harness-visualization/harness';

export interface DialogTurn {
  turn: number;
  question: string;
  // Номер события и мс от начала записи.
  askedIndex: number;
  askedAt: number;
  // null — ответа ещё нет.
  answer: string | null;
  answeredIndex: number | null;
  answeredAt: number | null;
  steps: number;
  tools: number;
  // Поручения субагентам (этап 6c); их шаги и тулы в steps и tools не входят.
  delegations: number;
  // Сумма input tokens всех запросов к модели в этом ходе.
  inputTokens: number;
}

export function projectDialog(events: readonly HarnessEvent[]): DialogTurn[] {
  const first = events[0];
  const startedAt = first === undefined ? 0 : Date.parse(first.timestamp);
  const turns: DialogTurn[] = [];
  events.forEach((event, index) => {
    const at = Date.parse(event.timestamp) - startedAt;
    const current = turns.at(-1);
    if (event.type === 'user_message') {
      turns.push(newTurn(turns.length + 1, event.text, index, at));
      return;
    }
    if (current === undefined || current.answer !== null) {
      return;
    }
    countInto(current, event);
    if (event.type === 'assistant_message') {
      Object.assign(current, { answer: event.text, answeredIndex: index, answeredAt: at });
    }
  });
  return turns;
}

function newTurn(turn: number, question: string, askedIndex: number, askedAt: number): DialogTurn {
  return {
    turn,
    question,
    askedIndex,
    askedAt,
    answer: null,
    answeredIndex: null,
    answeredAt: null,
    steps: 0,
    tools: 0,
    delegations: 0,
    inputTokens: 0,
  };
}

// Шаги и тулы — главного агента; input — всех, включая субагентов: это цена хода.
function countInto(turn: DialogTurn, event: HarnessEvent): void {
  if (event.type === 'subagent_started') {
    turn.delegations += 1;
  }
  if (event.agentId !== undefined) {
    if (event.type === 'model_response') {
      turn.inputTokens += event.reply.usage.inputTokens;
    }
    return;
  }
  if (event.type === 'model_request' && event.purpose === 'agentStep') {
    turn.steps += 1;
  }
  if (event.type === 'tool_call') {
    turn.tools += 1;
  }
  if (event.type === 'model_response') {
    turn.inputTokens += event.reply.usage.inputTokens;
  }
}

// Что харнесс делает сейчас — по последнему показанному событию хода. Коротко, для строки
// под вопросом: подробности — на схеме и в инспекторе.
export function turnStatus(events: readonly HarnessEvent[], shown: number): string {
  for (let index = Math.min(shown, events.length) - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event === undefined || event.type === 'user_message') {
      break;
    }
    const status = STATUSES[event.type]?.(event);
    if (status !== undefined) {
      // Субагент (этап 6c) работает за главного — строка говорит, кто именно.
      return event.agentId === undefined ? status : `субагент ${event.agentId}: ${status}`;
    }
  }
  return 'харнесс принял вопрос';
}

const STATUSES: Partial<Record<HarnessEvent['type'], (event: HarnessEvent) => string>> = {
  prompt_assembled: () => 'харнесс собирает prompt',
  query_rewritten: () => 'харнесс ищет в базе знаний',
  context_retrieved: () => 'харнесс подмешивает найденное',
  model_request: describeRequest,
  model_response: () => 'модель ответила — харнесс разбирает ответ',
  permission_evaluated: () => 'политика проверяет вызов',
  permission_requested: () => 'ждёт вашего разрешения',
  tool_call: (event) =>
    event.type === 'tool_call' ? `вызывает ${event.toolName}` : 'вызывает тул',
  tool_result: () => 'результат тула — в историю',
  tool_result_truncated: () => 'харнесс обрезает большой результат тула',
  tool_results_cleared: () => 'харнесс освобождает место в контексте',
  history_compacted: () => 'харнесс заменил прошлые ходы сводкой',
  iteration_limit_reached: () => 'лимит шагов — харнесс просит ответить по найденному',
  subagent_started: (event) =>
    event.type === 'subagent_started'
      ? `поручает задачу субагенту ${event.subagentId}`
      : 'поручает задачу субагенту',
  subagent_finished: (event) =>
    event.type === 'subagent_finished'
      ? `субагент ${event.subagentId} вернул отчёт`
      : 'субагент вернул отчёт',
};

function describeRequest(event: HarnessEvent): string {
  if (event.type !== 'model_request') {
    return 'запрос к модели';
  }
  switch (event.purpose) {
    case 'agentStep':
      return `модель думает · шаг ${String(event.iteration ?? '?')}`;
    case 'compaction':
      return 'харнесс сжимает историю в сводку';
    case 'queryRewrite':
    case 'groundingJudge':
      return 'служебный запрос к модели';
  }
}

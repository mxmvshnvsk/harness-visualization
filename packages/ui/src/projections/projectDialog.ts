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
    inputTokens: 0,
  };
}

function countInto(turn: DialogTurn, event: HarnessEvent): void {
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
      return status;
    }
  }
  return 'харнесс принял вопрос';
}

const STATUSES: Partial<Record<HarnessEvent['type'], (event: HarnessEvent) => string>> = {
  prompt_assembled: () => 'харнесс собирает prompt',
  query_rewritten: () => 'харнесс ищет в базе знаний',
  context_retrieved: () => 'харнесс подмешивает найденное',
  model_request: (event) =>
    event.type === 'model_request' && event.purpose === 'agentStep'
      ? `модель думает · шаг ${String(event.iteration ?? '?')}`
      : 'служебный запрос к модели',
  model_response: () => 'модель ответила — харнесс разбирает ответ',
  permission_evaluated: () => 'политика проверяет вызов',
  permission_requested: () => 'ждёт вашего разрешения',
  tool_call: (event) =>
    event.type === 'tool_call' ? `вызывает ${event.toolName}` : 'вызывает тул',
  tool_result: () => 'результат тула — в историю',
};

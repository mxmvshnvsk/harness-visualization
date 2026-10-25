// Экран «Контекст» (этап 6.6): каждый запрос к модели — из чего состоял prompt (оценка
// харнесса по частям), сколько он занял точно (usage ответа), сколько пришло из кэша и что
// харнесс сделал с контекстом перед ним: обрезал результаты, убрал старые, сжал историю.

import type { HarnessEvent, PromptBudget } from '@harness-visualization/harness';

export interface ContextRequest {
  requestId: string;
  // Номер события model_request — по нему повтор отмечает пройденное.
  index: number;
  // Мс от начала записи.
  at: number;
  turn: number;
  // Шаг агента; null — служебный запрос (сводка, переформулировка).
  step: number | null;
  purpose: string;
  budget: PromptBudget;
  // Из usage ответа; null — ответа ещё нет.
  exactTokens: number | null;
  cacheHitTokens: number | null;
  // Что харнесс сделал с контекстом с прошлого запроса.
  truncated: number;
  cleared: number;
  compacted: boolean;
}

interface Pending {
  truncated: number;
  cleared: number;
  compacted: boolean;
}

export function projectContext(events: readonly HarnessEvent[]): ContextRequest[] {
  const first = events[0];
  const startedAt = first === undefined ? 0 : Date.parse(first.timestamp);
  const requests: ContextRequest[] = [];
  let turn = 0;
  let pending: Pending = { truncated: 0, cleared: 0, compacted: false };
  events.forEach((event, index) => {
    if (event.type === 'user_message') {
      turn += 1;
    }
    pending = notePending(pending, event);
    if (event.type === 'model_request' && event.budget !== undefined && event.budget !== null) {
      requests.push({
        requestId: event.requestId,
        index,
        at: Date.parse(event.timestamp) - startedAt,
        turn: Math.max(1, turn),
        step: event.purpose === 'agentStep' ? event.iteration : null,
        purpose: event.purpose,
        budget: event.budget,
        exactTokens: null,
        cacheHitTokens: null,
        ...pending,
      });
      pending = { truncated: 0, cleared: 0, compacted: false };
    }
    if (event.type === 'model_response') {
      const request = requests.find((item) => item.requestId === event.requestId);
      if (request !== undefined) {
        request.exactTokens = event.reply.usage.inputTokens;
        request.cacheHitTokens = event.reply.usage.inputCacheHitTokens;
      }
    }
  });
  return requests;
}

function notePending(pending: Pending, event: HarnessEvent): Pending {
  switch (event.type) {
    case 'tool_result_truncated':
      return { ...pending, truncated: pending.truncated + 1 };
    case 'tool_results_cleared':
      return { ...pending, cleared: pending.cleared + event.cleared.length };
    case 'history_compacted':
      return { ...pending, compacted: true };
    default:
      return pending;
  }
}

// Подпись под столбиком: «в2 ш1» — вопрос 2, шаг 1; служебный — по назначению.
export function requestLabel(request: ContextRequest): string {
  if (request.step !== null) {
    return `в${String(request.turn)} ш${String(request.step)}`;
  }
  return request.purpose === 'compaction' ? 'сводка' : 'служ.';
}

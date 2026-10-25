// Что печатает модель прямо сейчас (этап 8d.3) — для «Диалога»: текущий шаг главного агента,
// его фаза и уже написанный текст рассуждения и ответа.
//
// Вживую текст — из кусочков SSE delta. В повторе трейса кусочков нет: печатаем текст из
// model_response по записанным моментам timing — равномерно внутри фазы. Это приближение:
// когда пришёл каждый токен, в трейсе не записано.

import type { HarnessEvent } from '@harness-visualization/harness';
import type { EventOfType } from '../events/eventTypes';

export type TypingPhase = 'wait' | 'reasoning' | 'answer';

export interface Typing {
  requestId: string;
  iteration: number | null;
  phase: TypingPhase;
  reasoning: string;
  answer: string;
  // Модель зовёт тулы, а не пишет ответ: ответа печатать не будет.
  toolCalls: boolean;
}

export interface TypedText {
  reasoning: string;
  answer: string;
}

// Последний запрос шага главного агента среди показанных событий, на который ещё нет ответа.
export function pendingStep(
  events: readonly HarnessEvent[],
  shown: number,
): EventOfType<'model_request'> | null {
  let pending: EventOfType<'model_request'> | null = null;
  for (const event of events.slice(0, shown)) {
    if (event.agentId !== undefined) {
      continue;
    }
    if (event.type === 'model_request' && event.purpose === 'agentStep') {
      pending = event;
    } else if (
      (event.type === 'model_response' || event.type === 'model_error') &&
      event.requestId === pending?.requestId
    ) {
      pending = null;
    }
  }
  return pending;
}

// Вживую: фаза — по тому, что уже напечатано.
export function typingFromDeltas(
  request: EventOfType<'model_request'>,
  text: TypedText | undefined,
): Typing {
  const reasoning = text?.reasoning ?? '';
  const answer = text?.answer ?? '';
  return {
    requestId: request.requestId,
    iteration: request.iteration,
    phase: deltaPhase(reasoning, answer),
    reasoning,
    answer,
    toolCalls: false,
  };
}

// Повтор: elapsedMs — сколько прошло с отправки запроса по времени записи.
export function typingFromTrace(
  request: EventOfType<'model_request'>,
  events: readonly HarnessEvent[],
  elapsedMs: number,
): Typing | null {
  const response = events.find(
    (event): event is EventOfType<'model_response'> =>
      event.type === 'model_response' && event.requestId === request.requestId,
  );
  const timing = response?.timing ?? null;
  if (response === undefined || timing === null || timing.firstTokenMs === null) {
    return null;
  }
  const first = timing.firstTokenMs;
  const answerAt = timing.firstAnswerTokenMs ?? first;
  const last = Math.max(timing.lastTokenMs ?? answerAt, answerAt);
  const { reasoningText, text, toolCalls } = response.reply;
  return {
    requestId: request.requestId,
    iteration: request.iteration,
    phase: tracePhase(elapsedMs, first, answerAt),
    reasoning: slice(reasoningText, elapsedMs, first, answerAt),
    answer: slice(text, elapsedMs, answerAt, last),
    toolCalls: toolCalls.length > 0,
  };
}

function deltaPhase(reasoning: string, answer: string): TypingPhase {
  if (answer !== '') {
    return 'answer';
  }
  return reasoning === '' ? 'wait' : 'reasoning';
}

function tracePhase(elapsedMs: number, first: number, answerAt: number): TypingPhase {
  if (elapsedMs < first) {
    return 'wait';
  }
  return elapsedMs < answerAt ? 'reasoning' : 'answer';
}

function slice(text: string | null, elapsedMs: number, from: number, to: number): string {
  if (text === null || elapsedMs <= from) {
    return '';
  }
  const share = to <= from ? 1 : Math.min(1, (elapsedMs - from) / (to - from));
  return text.slice(0, Math.round(text.length * share));
}

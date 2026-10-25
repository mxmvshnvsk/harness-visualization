// Фазы запроса к модели по моментам потокового ответа (этап 8d.3): сколько ждали первый токен,
// сколько модель рассуждала, сколько писала ответ или вызов тула. Моменты пишет харнесс
// в model_response.timing (этап 8d.2); в трейсах до него их нет — тогда фаз нет.

import type { EventOfType } from '../events/eventTypes';

// Короче этого скорость в токенах в секунду — шум: куски приходят пачками.
const MIN_RATE_WINDOW_MS = 300;

export interface InferenceTiming {
  totalMs: number;
  // Моменты от отправки запроса.
  firstMs: number;
  answerAtMs: number;
  lastMs: number;
  // Длительности фаз.
  waitMs: number;
  reasoningMs: number;
  answerMs: number;
  // После последнего токена: usage и конец потока.
  tailMs: number;
  reasoningTokens: number;
  answerTokens: number;
  // Токенов в секунду; null — фаза слишком короткая, чтобы мерить.
  reasoningRate: number | null;
  answerRate: number | null;
  // Модель не писала ответ, а звала тулы.
  toolCalls: boolean;
}

export function inferenceTiming(
  response: EventOfType<'model_response'> | null,
): InferenceTiming | null {
  const timing = response?.timing ?? null;
  if (response === null || timing === null || timing.firstTokenMs === null) {
    return null;
  }
  const firstMs = timing.firstTokenMs;
  const answerAtMs = timing.firstAnswerTokenMs ?? timing.lastTokenMs ?? firstMs;
  const lastMs = Math.max(timing.lastTokenMs ?? answerAtMs, answerAtMs);
  const totalMs = Math.max(response.durationMs, lastMs);
  const { usage, toolCalls } = response.reply;
  const answerTokens = Math.max(usage.outputTokens - usage.reasoningTokens, 0);
  return {
    totalMs,
    firstMs,
    answerAtMs,
    lastMs,
    waitMs: firstMs,
    reasoningMs: answerAtMs - firstMs,
    answerMs: lastMs - answerAtMs,
    tailMs: totalMs - lastMs,
    reasoningTokens: usage.reasoningTokens,
    answerTokens,
    reasoningRate: rate(usage.reasoningTokens, answerAtMs - firstMs),
    answerRate: rate(answerTokens, lastMs - answerAtMs),
    toolCalls: toolCalls.length > 0,
  };
}

function rate(tokens: number, ms: number): number | null {
  return ms < MIN_RATE_WINDOW_MS || tokens === 0 ? null : Math.round(tokens / (ms / 1000));
}

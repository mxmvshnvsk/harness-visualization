// Лаборатория «Выбор токена» (этап 11): прогон из трейса — вопрос и по ответу на каждую
// температуру, с вероятностями токенов. Вероятность — e^logprob; у DeepSeek она уже после
// температуры (проба 26.10.2026), поэтому ответы при T = 0, 1 и 1.5 показывают настоящие
// распределения, а пересчёт в браузере делаем только от ответа при T = 1.

import type { HarnessEvent, TokenLabFork, TokenLogprob } from '@harness-visualization/harness';

export interface TokenChoice {
  text: string;
  probability: number;
}

export interface TokenView {
  text: string;
  logprob: number;
  probability: number;
  // Альтернативы по убыванию вероятности, вместе с выбранным токеном.
  options: TokenChoice[];
}

export interface TokenLabAnswer {
  temperature: number | null;
  text: string | null;
  reasoning: string | null;
  tokens: TokenView[];
  reasoningTokens: TokenView[];
  outputTokens: number;
  durationMs: number;
}

export interface TokenLabView {
  question: string;
  reasoningEffort: string;
  model: string;
  answers: TokenLabAnswer[];
  error: string | null;
  // Развилка (11.3): от какого прогона и с какого токена; null — обычный прогон.
  fork: TokenLabFork | null;
}

// Развилка — токен, который модель выбрала с вероятностью меньше половины.
export const FORK_THRESHOLD = 0.5;

export function projectTokenLab(events: readonly HarnessEvent[]): TokenLabView {
  const view: TokenLabView = {
    question: '',
    reasoningEffort: 'off',
    model: '',
    answers: [],
    error: null,
    fork: null,
  };
  const temperatures = new Map<string, number | null>();
  for (const event of events) {
    if (event.type === 'session_started') {
      view.reasoningEffort = event.reasoningEffort;
      view.model = event.model;
      view.fork = event.tokenLab?.fork ?? null;
    } else if (event.type === 'user_message') {
      view.question = event.text;
    } else if (event.type === 'model_request') {
      temperatures.set(event.requestId, temperatureOf(event.body));
    } else if (event.type === 'model_response') {
      view.answers.push(answerOf(event, temperatures.get(event.requestId) ?? null));
    } else if (event.type === 'error') {
      view.error = event.message;
    }
  }
  return view;
}

function answerOf(
  event: Extract<HarnessEvent, { type: 'model_response' }>,
  temperature: number | null,
): TokenLabAnswer {
  const { reply } = event;
  return {
    temperature,
    text: reply.text,
    reasoning: reply.reasoningText,
    tokens: (reply.logprobs?.content ?? []).map(toTokenView),
    reasoningTokens: (reply.logprobs?.reasoning ?? []).map(toTokenView),
    outputTokens: reply.usage.outputTokens,
    durationMs: event.durationMs,
  };
}

function temperatureOf(body: Record<string, unknown>): number | null {
  return typeof body.temperature === 'number' ? body.temperature : null;
}

export function toTokenView(token: TokenLogprob): TokenView {
  const options = token.top
    .map((option) => ({ text: option.token, probability: Math.exp(option.logprob) }))
    .sort((left, right) => right.probability - left.probability);
  if (!options.some((option) => option.text === token.token)) {
    options.unshift({ text: token.token, probability: Math.exp(token.logprob) });
  }
  return {
    text: token.token,
    logprob: token.logprob,
    probability: Math.exp(token.logprob),
    options,
  };
}

export interface TokenStats {
  count: number;
  forks: number;
  // Геометрическое среднее вероятностей: «средняя уверенность» на токен.
  meanProbability: number;
}

export function tokenStats(tokens: readonly TokenView[]): TokenStats {
  if (tokens.length === 0) {
    return { count: 0, forks: 0, meanProbability: 0 };
  }
  const logSum = tokens.reduce((sum, token) => sum + token.logprob, 0);
  return {
    count: tokens.length,
    forks: tokens.filter((token) => token.probability < FORK_THRESHOLD).length,
    meanProbability: Math.exp(logSum / tokens.length),
  };
}

// Температура по топ-20 одной позиции: p_i ∝ p_i^(1/T). Хвоста за топ-20 API не отдаёт —
// пересчёт по тем, что есть, и нормировка на них. T = 0 — всегда самый вероятный.
export function applyTemperature(
  options: readonly TokenChoice[],
  temperature: number,
): TokenChoice[] {
  if (options.length === 0) {
    return [];
  }
  if (temperature <= 0) {
    return options.map((option, index) => ({ ...option, probability: index === 0 ? 1 : 0 }));
  }
  const weights = options.map((option) =>
    option.probability === 0 ? 0 : Math.exp(Math.log(option.probability) / temperature),
  );
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return options.map((option, index) => ({
    ...option,
    probability: total === 0 ? 0 : (weights[index] ?? 0) / total,
  }));
}

// top_p: самые вероятные, пока их сумма не наберёт topP; остальные — 0, оставшиеся нормируются.
export function applyTopP(options: readonly TokenChoice[], topP: number): TokenChoice[] {
  let accumulated = 0;
  const kept = new Set<number>();
  options.forEach((option, index) => {
    if (accumulated < topP) {
      kept.add(index);
      accumulated += option.probability;
    }
  });
  const total = options.reduce(
    (sum, option, index) => sum + (kept.has(index) ? option.probability : 0),
    0,
  );
  return options.map((option, index) => ({
    ...option,
    probability: kept.has(index) && total > 0 ? option.probability / total : 0,
  }));
}

// Вытянуть токен, как сэмплер: random — число от 0 до 1.
export function drawToken(options: readonly TokenChoice[], random: number): string {
  let left = random;
  for (const option of options) {
    left -= option.probability;
    if (left <= 0) {
      return option.text;
    }
  }
  return options.find((option) => option.probability > 0)?.text ?? '';
}

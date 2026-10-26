import { describe, expect, it } from 'vitest';
import type { HarnessEventPayload } from '@harness-visualization/harness';
import {
  applyTemperature,
  applyTopP,
  drawToken,
  projectTokenLab,
  tokenStats,
  toTokenView,
} from './projectTokenLab';
import { EventLog, sessionStarted } from './testEvents';

// Прогон лаборатории «Выбор токена»: вопрос и два ответа — при T = 1 и T = 0. Вероятности —
// как в пробе DeepSeek 26.10.2026: «С» 84 %, «По» 16 %.
const ln = Math.log;

function request(id: string, temperature: number): HarnessEventPayload {
  return {
    type: 'model_request',
    requestId: id,
    purpose: 'tokenLab',
    iteration: null,
    reasoningEffort: 'off',
    method: 'POST',
    url: 'https://api.deepseek.com/chat/completions',
    headers: {},
    body: { temperature, logprobs: true, top_logprobs: 20 },
  };
}

function response(id: string, first: string, probability: number): HarnessEventPayload {
  return {
    type: 'model_response',
    requestId: id,
    status: 200,
    durationMs: 900,
    timing: null,
    body: {},
    cost: null,
    reply: {
      responseId: id,
      model: 'deepseek-flash',
      finishReason: 'stop',
      text: `${first}огласно ТК — 28 дней.`,
      reasoningText: null,
      toolCalls: [],
      usage: {
        inputTokens: 20,
        inputCacheHitTokens: 0,
        inputCacheMissTokens: 20,
        outputTokens: 2,
        reasoningTokens: 0,
      },
      logprobs: {
        content: [
          {
            token: first,
            logprob: ln(probability),
            top: [
              { token: 'По', logprob: ln(0.16) },
              { token: 'С', logprob: ln(0.84) },
            ],
          },
          { token: 'огласно', logprob: 0, top: [{ token: 'огласно', logprob: 0 }] },
        ],
        reasoning: [],
      },
    },
  };
}

function run(): ReturnType<typeof projectTokenLab> {
  const log = new EventLog()
    .add(sessionStarted())
    .add({ type: 'user_message', text: 'Сколько дней отпуска?' })
    .add(request('r1', 1))
    .add(response('r1', 'С', 0.84))
    .add(request('r2', 0))
    .add(response('r2', 'С', 1));
  return projectTokenLab(log.events);
}

describe('лаборатория «Выбор токена»', () => {
  it('ответы по температурам, вероятность — e^logprob, альтернативы по убыванию', () => {
    const view = run();
    expect(view.question).toBe('Сколько дней отпуска?');
    expect(view.answers.map((answer) => answer.temperature)).toEqual([1, 0]);
    const first = view.answers[0]?.tokens[0];
    expect(first?.probability).toBeCloseTo(0.84);
    expect(first?.options.map((option) => option.text)).toEqual(['С', 'По']);
  });

  it('развилка — меньше 50 %; средняя уверенность — геометрическое среднее', () => {
    const tokens = run().answers[0]?.tokens ?? [];
    const stats = tokenStats(tokens);
    expect(stats.forks).toBe(0);
    expect(stats.meanProbability).toBeCloseTo(Math.sqrt(0.84));
    const fork = toTokenView({ token: 'По', logprob: ln(0.16), top: [] });
    expect(tokenStats([fork]).forks).toBe(1);
  });

  it('температура: 0 — только лучший, 1 — как есть, выше — площе', () => {
    const options = [
      { text: 'С', probability: 0.84 },
      { text: 'По', probability: 0.16 },
    ];
    expect(applyTemperature(options, 0).map((option) => option.probability)).toEqual([1, 0]);
    expect(applyTemperature(options, 1)[0]?.probability).toBeCloseTo(0.84);
    expect(applyTemperature(options, 2)[0]?.probability).toBeCloseTo(
      Math.sqrt(0.84) / (Math.sqrt(0.84) + Math.sqrt(0.16)),
    );
  });

  it('top_p отрезает хвост; сэмплер тянет по вероятностям', () => {
    const options = [
      { text: 'С', probability: 0.84 },
      { text: 'По', probability: 0.16 },
    ];
    expect(applyTopP(options, 0.8).map((option) => option.probability)).toEqual([1, 0]);
    expect(drawToken(options, 0.5)).toBe('С');
    expect(drawToken(options, 0.9)).toBe('По');
  });
});

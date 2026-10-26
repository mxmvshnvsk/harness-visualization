import { describe, expect, it } from 'vitest';
import type { HarnessEventPayload } from '@harness-visualization/harness';
import { projectResearch } from './projectResearch';
import { EventLog, modelRequest, sessionStarted, toolCall, toolCallEvent } from './testEvents';

function response(id: string, input: number): HarnessEventPayload {
  return {
    type: 'model_response',
    requestId: id,
    status: 200,
    durationMs: 1200,
    timing: null,
    body: {},
    cost: null,
    reply: {
      responseId: id,
      model: 'm',
      finishReason: 'stop',
      text: null,
      reasoningText: null,
      toolCalls: [],
      usage: {
        inputTokens: input,
        inputCacheHitTokens: 0,
        inputCacheMissTokens: input,
        outputTokens: 10,
        reasoningTokens: 0,
      },
    },
  };
}

function log(): EventLog {
  return new EventLog()
    .add(sessionStarted())
    .add({ type: 'user_message', text: 'Когда сдавать отчёт?' })
    .add(modelRequest('r1', 1))
    .add({
      type: 'network_request',
      host: 'api.deepseek.com',
      route: 'proxy',
      viaProxy: true,
      rule: null,
      proxyUrl: null,
    })
    .add(response('r1', 3000))
    .add(toolCallEvent(toolCall('c1', 'search_knowledge', '{"query":"отчёт"}')))
    .add({
      type: 'tool_results_cleared',
      cleared: [{ toolCallId: 'c0', toolName: 'search_knowledge', tokens: 900 }],
      beforeTokens: 9000,
      afterTokens: 8100,
      thresholdTokens: 8000,
      targetTokens: 6000,
      preset: 'demo',
    })
    .add(modelRequest('r2', 2))
    .add(response('r2', 4000));
}

describe('режим «Исследование»: шаги', () => {
  it('запросы с ответом и сетью, события харнесса — между ними', () => {
    const view = projectResearch(log().events, Number.POSITIVE_INFINITY);
    expect(view.before.map((note) => note.text)).toEqual(['вопрос: Когда сдавать отчёт?']);
    expect(view.steps.map((step) => step.label)).toEqual(['шаг 1', 'шаг 2']);
    expect(view.steps[0]?.network?.route).toBe('proxy');
    expect(view.steps[0]?.response?.reply.usage.inputTokens).toBe(3000);
    expect(view.steps[0]?.notes.map((note) => note.type)).toEqual([
      'tool_call',
      'tool_results_cleared',
    ]);
    expect(view.steps[1]?.previous).toBe(0);
  });

  it('идёт за курсором повтора', () => {
    const events = log().events;
    const view = projectResearch(events, 4);
    expect(view.steps).toHaveLength(1);
    expect(view.steps[0]?.response).toBeNull();
  });
});

describe('поиск в сыром JSON', () => {
  it('без учёта регистра, все вхождения по порядку', async () => {
    const { findMatches } = await import('../features/research/SearchableJson');
    expect(findMatches('{"Отпуск": "отпуск — 28 дней"}', 'отпуск')).toEqual([
      { start: 2, end: 8 },
      { start: 12, end: 18 },
    ]);
    expect(findMatches('abc', '')).toEqual([]);
  });
});

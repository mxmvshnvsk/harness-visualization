import { describe, expect, it } from 'vitest';
import type { EventOfType } from '../events/eventTypes';
import { inferenceTiming } from './inferenceTiming';
import { modelResponse, toolCall, usage } from './testEvents';

// Цифры — шаг 3 настоящей сессии «что такое websoket?» (трейс 89db4398).
function response(
  options: Partial<Parameters<typeof modelResponse>[1]>,
): EventOfType<'model_response'> {
  return {
    ...modelResponse('request-1', {
      usage: { ...usage(3832, 3456, 472), reasoningTokens: 121 },
      durationMs: 3333,
      timing: { firstTokenMs: 681, firstAnswerTokenMs: 1415, lastTokenMs: 3331, chunks: 473 },
      ...options,
    }),
    sequence: 1,
    sessionId: 'session',
    timestamp: '2026-10-25T20:48:50.000Z',
  } as EventOfType<'model_response'>;
}

describe('inferenceTiming', () => {
  it('делит запрос на ожидание первого токена, рассуждение и ответ', () => {
    const timing = inferenceTiming(response({}));
    expect(timing).toMatchObject({
      waitMs: 681,
      reasoningMs: 734,
      answerMs: 1916,
      tailMs: 2,
      answerTokens: 351,
      reasoningRate: 165,
      answerRate: 183,
      toolCalls: false,
    });
  });

  it('не мерит скорость короткой фазы: куски приходят пачками', () => {
    const timing = inferenceTiming(
      response({
        usage: { ...usage(3517, 3328, 57), reasoningTokens: 14 },
        durationMs: 1022,
        timing: { firstTokenMs: 805, firstAnswerTokenMs: 949, lastTokenMs: 994, chunks: 27 },
        toolCalls: [toolCall('call-1', 'kedr__read_document')],
      }),
    );
    expect(timing?.reasoningRate).toBeNull();
    expect(timing?.answerRate).toBeNull();
    expect(timing?.toolCalls).toBe(true);
  });

  it('без рассуждений ответ начинается с первого токена', () => {
    const timing = inferenceTiming(
      response({
        timing: { firstTokenMs: 500, firstAnswerTokenMs: 500, lastTokenMs: 1400, chunks: 40 },
      }),
    );
    expect(timing?.reasoningMs).toBe(0);
    expect(timing?.answerMs).toBe(900);
  });

  it('у трейса до 8d.2 и у ответа целиком фаз нет', () => {
    expect(inferenceTiming(response({ timing: undefined }))).toBeNull();
    expect(inferenceTiming(response({ timing: null }))).toBeNull();
    expect(inferenceTiming(null)).toBeNull();
  });
});

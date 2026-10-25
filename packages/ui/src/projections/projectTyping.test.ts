import { describe, expect, it } from 'vitest';
import type { HarnessEvent } from '@harness-visualization/harness';
import type { EventOfType } from '../events/eventTypes';
import { pendingStep, typingFromDeltas, typingFromTrace } from './projectTyping';
import { EventLog, modelRequest, modelResponse, sessionStarted, usage } from './testEvents';

function session(): readonly HarnessEvent[] {
  return new EventLog()
    .add(sessionStarted())
    .add({ type: 'user_message', text: 'что такое websocket?' })
    .add(modelRequest('r1', 1))
    .add({
      ...modelResponse('r1', {
        usage: { ...usage(3832, 3456, 40), reasoningTokens: 10 },
        text: 'WebSocket — протокол.',
        timing: { firstTokenMs: 100, firstAnswerTokenMs: 300, lastTokenMs: 500, chunks: 20 },
      }),
      reply: {
        responseId: 'x',
        model: 'deepseek-flash',
        finishReason: 'stop',
        text: 'WebSocket — протокол.',
        reasoningText: 'Отвечу коротко.',
        toolCalls: [],
        usage: { ...usage(3832, 3456, 40), reasoningTokens: 10 },
      },
    } as never).events;
}

describe('projectTyping', () => {
  it('ждёт ответа шаг, на который ещё нет model_response', () => {
    const events = session();
    expect(pendingStep(events, 3)?.requestId).toBe('r1');
    expect(pendingStep(events, events.length)).toBeNull();
  });

  it('вживую фаза — по напечатанному', () => {
    const request = pendingStep(session(), 3) as EventOfType<'model_request'>;
    expect(typingFromDeltas(request, undefined).phase).toBe('wait');
    expect(typingFromDeltas(request, { reasoning: 'Отвечу', answer: '' }).phase).toBe('reasoning');
    expect(typingFromDeltas(request, { reasoning: 'Отвечу', answer: 'Web' }).phase).toBe('answer');
  });

  it('в повторе печатает текст ответа по моментам timing', () => {
    const events = session();
    const request = pendingStep(events, 3) as EventOfType<'model_request'>;
    expect(typingFromTrace(request, events, 50)).toMatchObject({ phase: 'wait', reasoning: '' });
    expect(typingFromTrace(request, events, 200)).toMatchObject({
      phase: 'reasoning',
      reasoning: 'Отвечу к',
      answer: '',
    });
    expect(typingFromTrace(request, events, 400)).toMatchObject({
      phase: 'answer',
      reasoning: 'Отвечу коротко.',
      answer: 'WebSocket —',
    });
  });
});

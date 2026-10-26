import { describe, expect, it } from 'vitest';
import { listBranchSteps, prepareBranchPoint } from '@harness-visualization/harness/branch';
import type { HarnessEventPayload } from '@harness-visualization/harness';
import {
  EventLog,
  modelRequest,
  toolCall,
  toolCallEvent,
  toolResult,
} from '../projections/testEvents';

const search = toolCall('call-1', 'kedr__read_document', '{"id":"faq/hrFaq"}');

// Запрос шага с телом, как его пишет провайдер: сообщения в формате API.
function stepRequest(
  requestId: string,
  iteration: number,
  messages: unknown[],
): HarnessEventPayload {
  const request = modelRequest(requestId, iteration);
  return request.type === 'model_request' ? { ...request, body: { messages } } : request;
}

function sourceLog() {
  return new EventLog()
    .add({ type: 'user_message', text: 'удалёнка' })
    .add(
      stepRequest('r1', 1, [
        { role: 'system', content: 'system' },
        { role: 'user', content: 'удалёнка' },
      ]),
    )
    .add(toolCallEvent(search))
    .add(toolResult(search))
    .add(
      stepRequest('r2', 2, [
        { role: 'system', content: 'system' },
        { role: 'user', content: 'удалёнка' },
        {
          role: 'assistant',
          content: null,
          reasoning_content: 'надо прочитать FAQ',
          tool_calls: [
            {
              id: 'call-1',
              type: 'function',
              function: { name: 'kedr__read_document', arguments: '{"id":"faq/hrFaq"}' },
            },
          ],
        },
        { role: 'tool', tool_call_id: 'call-1', content: 'До двух дней в неделю.' },
      ]),
    );
}

describe('точка ветвления', () => {
  it('шаги главного агента по порядку и результаты тулов к каждому', () => {
    const steps = listBranchSteps(sourceLog().events);
    expect(steps.map((step) => step.step)).toEqual([1, 2]);
    expect(steps[0]?.toolResults).toEqual([]);
    expect(steps[1]?.toolResults[0]).toMatchObject({
      toolCallId: 'call-1',
      toolName: 'kedr__read_document',
    });
    expect(steps[1]?.question).toBe('удалёнка');
  });

  it('история шага — из тела запроса, с рассуждением и вызовами тулов', () => {
    const point = prepareBranchPoint(sourceLog().events, 2, { kind: 'replay' });
    expect(point.messages.map((message) => message.role)).toEqual([
      'system',
      'user',
      'assistant',
      'tool',
    ]);
    expect(point.messages[2]).toMatchObject({
      reasoningContent: 'надо прочитать FAQ',
      toolCalls: [{ id: 'call-1', name: 'kedr__read_document' }],
    });
  });

  it('подмена результата тула — в истории и в описании правки', () => {
    const point = prepareBranchPoint(sourceLog().events, 2, {
      kind: 'toolResult',
      toolCallId: 'call-1',
      content: 'Документ не найден.',
    });
    expect(point.messages[3]).toEqual({
      role: 'tool',
      toolCallId: 'call-1',
      content: 'Документ не найден.',
    });
    expect(point.change).toEqual({
      kind: 'toolResult',
      toolCallId: 'call-1',
      toolName: 'kedr__read_document',
      before: 'До двух дней в неделю.',
      after: 'Документ не найден.',
    });
  });

  it('результат, которого к шагу ещё не было, подменить нельзя', () => {
    expect(() =>
      prepareBranchPoint(sourceLog().events, 1, {
        kind: 'toolResult',
        toolCallId: 'call-1',
        content: 'x',
      }),
    ).toThrow(/нет в истории шага/u);
  });
});

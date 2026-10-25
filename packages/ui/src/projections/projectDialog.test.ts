import { describe, expect, it } from 'vitest';
import { projectDialog, turnStatus } from './projectDialog';
import {
  EventLog,
  modelRequest,
  modelResponse,
  sessionStarted,
  toolCall,
  toolCallEvent,
  toolResult,
  usage,
} from './testEvents';

function dialog(): EventLog {
  const search = toolCall('call-1', 'kedr__search', '{"query":"удалённая работа"}');
  return new EventLog()
    .add(sessionStarted())
    .add({ type: 'user_message', text: 'удалёнка' })
    .add(modelRequest('request-1', 1))
    .add(modelResponse('request-1', { usage: usage(1963, 1792), toolCalls: [search] }))
    .add(toolCallEvent(search))
    .add(toolResult(search))
    .add(modelRequest('request-2', 2))
    .add(modelResponse('request-2', { usage: usage(3259, 2048), text: 'До трёх дней.' }))
    .add({ type: 'assistant_message', text: 'До трёх дней.' })
    .add({ type: 'awaiting_question', turn: 1 })
    .add({ type: 'user_message', text: 'а гибрид?' })
    .add(modelRequest('request-3', 1));
}

describe('projectDialog', () => {
  it('ход — вопрос, ответ и итог; ход без ответа ещё идёт', () => {
    const [first, second] = projectDialog(dialog().events);

    expect(first).toMatchObject({
      turn: 1,
      question: 'удалёнка',
      answer: 'До трёх дней.',
      steps: 2,
      tools: 1,
      inputTokens: 1963 + 3259,
    });
    expect(second).toMatchObject({ turn: 2, question: 'а гибрид?', answer: null, steps: 1 });
  });

  it('строка хода — по последнему показанному событию', () => {
    const { events } = dialog();

    // Показаны первые 5 событий: последнее — tool_call.
    expect(turnStatus(events, 5)).toBe('вызывает kedr__search');
    expect(turnStatus(events, events.length)).toBe('модель думает · шаг 1');
  });
});

import { describe, expect, it } from 'vitest';
import { activeStage, projectStages } from './projectStages';
import {
  EventLog,
  modelRequest,
  modelResponse,
  permissionEvaluated,
  sessionStarted,
  toolCall,
  toolCallEvent,
  toolResult,
  usage,
} from './testEvents';

function session(): EventLog {
  const search = toolCall('call-1', 'kedr__search', '{"query":"удалённая работа"}');
  return new EventLog()
    .add(sessionStarted())
    .add({ type: 'user_message', text: 'удалёнка' })
    .add(modelRequest('request-1', 1))
    .add(modelResponse('request-1', { usage: usage(1963, 1792), toolCalls: [search] }))
    .add(toolCallEvent(search))
    .add(permissionEvaluated(search, 'allow'))
    .add(toolResult(search))
    .add(modelRequest('request-2', 2))
    .add(modelResponse('request-2', { usage: usage(3259, 2048), text: 'До трёх дней.' }))
    .add({ type: 'assistant_message', text: 'До трёх дней.' });
}

describe('projectStages', () => {
  it('делит сессию на подготовку, шаги агента и ответ', () => {
    const stages = projectStages(session().events);

    expect(stages.map((stage) => [stage.title, stage.badge])).toEqual([
      ['Подготовка', 'до модели'],
      ['Шаг 1 · agentStep', 'tool_calls: 1'],
      ['Шаг 2 · agentStep', 'текст'],
      ['Ответ пользователю', 'assistant_message'],
    ]);
    expect(stages[0]?.rows.map((row) => row.text)).toEqual(['вопрос пользователя: «удалёнка»']);
  });

  it('у решения политики — имя тула', () => {
    const step = projectStages(session().events)[1];

    expect(step?.rows.find((row) => row.text.startsWith('политика'))?.code).toBe('kedr__search');
  });

  it('активный этап — тот, где последнее показанное событие', () => {
    const stages = projectStages(session().events);

    expect(activeStage(stages, 0)).toBeNull();
    // Показаны первые 5 событий: последнее — tool_call из шага 1.
    expect(activeStage(stages, 5)?.title).toBe('Шаг 1 · agentStep');
  });
});

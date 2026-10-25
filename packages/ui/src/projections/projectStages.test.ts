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

  it('следующий вопрос диалога — свой этап, а шаги и ответ подписаны его номером', () => {
    const log = session()
      .add({ type: 'awaiting_question', turn: 1 })
      .add({ type: 'user_message', text: 'а гибрид?' })
      .add(modelRequest('request-3', 1))
      .add(modelResponse('request-3', { usage: usage(4100, 3800), text: 'Два дня.' }))
      .add({ type: 'assistant_message', text: 'Два дня.' });
    const titles = projectStages(log.events).map((stage) => stage.title);

    expect(titles.slice(-4)).toEqual([
      'Ответ пользователю',
      'Вопрос 2',
      'Вопрос 2 · Шаг 1 · agentStep',
      'Ответ на вопрос 2',
    ]);
  });

  it('обрезанный харнессом результат — своя строка шага с размерами', () => {
    const log = session().add({
      type: 'tool_result_truncated',
      toolCallId: 'call-1',
      toolName: 'kedr__search',
      originalChars: 6500,
      keptChars: 4860,
      originalTokens: 2006,
      keptTokens: 1500,
      limitTokens: 1500,
      preset: 'demo',
    });
    const rows = projectStages(log.events).flatMap((stage) => stage.rows);

    // toLocaleString('ru-RU') разделяет тысячи неразрывным пробелом.
    expect(rows.at(-1)?.code).toBe('kedr__search');
    expect(rows.at(-1)?.text).toMatch(/^обрезан харнессом: ≈2\s006 → ≈1\s500 токенов/);
  });

  it('активный этап — тот, где последнее показанное событие', () => {
    const stages = projectStages(session().events);

    expect(activeStage(stages, 0)).toBeNull();
    // Показаны первые 5 событий: последнее — tool_call из шага 1.
    expect(activeStage(stages, 5)?.title).toBe('Шаг 1 · agentStep');
  });
});

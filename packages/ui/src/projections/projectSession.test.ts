import { describe, expect, it } from 'vitest';
import { projectSession } from './projectSession';
import {
  EventLog,
  modelRequest,
  modelResponse,
  permissionEvaluated,
  sessionFinished,
  sessionStarted,
  toolCall,
  toolCallEvent,
  toolResult,
  usage,
} from './testEvents';

// Сессия из двух шагов: модель просит kedr__search, потом отвечает текстом.
function twoStepSession(): EventLog {
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
    .add(modelResponse('request-2', { usage: usage(3259, 2048), text: 'До трёх дней в неделю.' }))
    .add({ type: 'assistant_message', text: 'До трёх дней в неделю.' })
    .add(sessionFinished(usage(5222, 3840, 100), 2));
}

describe('projectSession: шаги агента', () => {
  it('собирает шаги, тулы и ответ', () => {
    const view = projectSession(twoStepSession().events);

    expect(view.kind).toBe('session');
    expect(view.question).toBe('удалёнка');
    expect(view.status).toBe('finished');
    expect(view.steps.map((step) => step.outcome)).toEqual(['toolCalls', 'answer']);
    expect(view.steps[0]?.toolCalls.map((tool) => [tool.toolName, tool.status])).toEqual([
      ['kedr__search', 'success'],
    ]);
    expect(view.steps[1]?.toolCalls).toEqual([]);
    expect(view.answer).toBe('До трёх дней в неделю.');
  });

  it('итоги из событий совпадают с session_finished', () => {
    const log = twoStepSession();
    const view = projectSession(log.events);
    const finished = log.events.at(-1);

    expect(finished?.type).toBe('session_finished');
    if (finished?.type === 'session_finished') {
      expect(view.totals.usage).toEqual(finished.usage);
      expect(view.totals.modelRequests).toBe(finished.modelRequests);
      expect(view.totals.durationMs).toBe(finished.durationMs);
    }
    expect(view.totals.modelCosts).toEqual([{ currency: 'USD', total: 0.0002 }]);
  });

  it('срез событий показывает сессию на этот момент', () => {
    const log = twoStepSession();
    // Первые 8 событий: второй запрос к модели отправлен, ответа ещё нет.
    const view = projectSession(log.events.slice(0, 8));

    expect(view.status).toBe('inProgress');
    expect(view.steps.map((step) => step.outcome)).toEqual(['toolCalls', 'pending']);
    expect(view.answer).toBeNull();
    expect(view.totals.usage.inputTokens).toBe(1963);
  });
});

describe('projectSession: разрешения', () => {
  const remove = toolCall('call-del', 'delete_file', '{"path":"notes/probe.md"}');

  function askedSession(): EventLog {
    return new EventLog()
      .add(sessionStarted())
      .add(modelRequest('request-1', 1))
      .add(modelResponse('request-1', { usage: usage(900, 512), toolCalls: [remove] }))
      .add(toolCallEvent(remove))
      .add(permissionEvaluated(remove, 'ask'))
      .add({
        type: 'permission_requested',
        toolCallId: remove.id,
        toolName: remove.name,
        actionDescription: 'Удалить файл notes/probe.md',
      });
  }

  it('пока вопрос без ответа — тул ждёт пользователя', () => {
    const view = projectSession(askedSession().events);

    expect(view.toolCalls[0]?.status).toBe('waitingForUser');
    expect(view.toolCalls[0]?.evaluation?.decision).toBe('ask');
  });

  it('отказ по тайм-ауту виден в цепочке разрешения', () => {
    const log = askedSession()
      .add({
        type: 'permission_resolved',
        toolCallId: remove.id,
        toolName: remove.name,
        approved: false,
        answeredBy: 'timeout',
        waitedForUserMs: 120000,
      })
      .add(toolResult(remove, 'denied'));
    const tool = projectSession(log.events).toolCalls[0];

    expect(tool?.status).toBe('denied');
    expect(tool?.answer?.answeredBy).toBe('timeout');
    expect(tool?.question?.actionDescription).toBe('Удалить файл notes/probe.md');
  });
});

describe('projectSession: кэш prompt', () => {
  it('объясняет, чем прогрет кэш', () => {
    // Цифры сессии cb5ca3ab: в шаге 2 из кэша больше, чем весь prompt шага 1.
    const view = projectSession(twoStepSession().events);
    const [first, second] = view.modelCalls;

    expect(first?.cache).toMatchObject({ warmth: 'warm', exceedsPreviousPrompt: null });
    expect(second?.cache).toMatchObject({
      hitTokens: 2048,
      missTokens: 1211,
      warmth: 'warm',
      exceedsPreviousPrompt: true,
      previousStepInputTokens: 1963,
    });
  });

  it('холодный кэш — по тому же порогу, что у харнесса', () => {
    // Первая сессия дня: 128 токенов из 1 967 — общее начало многих запросов, не прогрев.
    const log = new EventLog()
      .add(sessionStarted())
      .add(modelRequest('request-1', 1))
      .add(modelResponse('request-1', { usage: usage(1967, 128), text: 'ответ' }));

    expect(projectSession(log.events).modelCalls[0]?.cache?.warmth).toBe('cold');
  });

  it('кэш в пределах предыдущего шага — exceedsPreviousPrompt false', () => {
    const log = new EventLog()
      .add(sessionStarted())
      .add(modelRequest('request-1', 1))
      .add(
        modelResponse('request-1', {
          usage: usage(2000, 0),
          toolCalls: [toolCall('c', 'list_files')],
        }),
      )
      .add(modelRequest('request-2', 2))
      .add(modelResponse('request-2', { usage: usage(2600, 1920), text: 'ответ' }));

    expect(projectSession(log.events).modelCalls[1]?.cache?.exceedsPreviousPrompt).toBe(false);
  });
});

describe('projectSession: служебные запросы, стоимость, ошибки', () => {
  it('rewrite — запрос к модели, но не шаг агента', () => {
    const log = new EventLog()
      .add(sessionStarted())
      .add({ type: 'user_message', text: 'удалёнка' })
      .add(modelRequest('rewrite-1', null, 'queryRewrite'))
      .add(modelResponse('rewrite-1', { usage: usage(300, 0), text: 'удалённая работа' }))
      .add({
        type: 'query_rewritten',
        requestId: 'rewrite-1',
        userQuestion: 'удалёнка',
        query: 'удалённая работа',
        usedFallback: false,
      })
      .add(modelRequest('request-1', 1));
    const view = projectSession(log.events);

    expect(view.modelCalls.map((call) => call.purpose)).toEqual(['queryRewrite', 'agentStep']);
    expect(view.steps).toHaveLength(1);
    expect(view.retrieval.rewrite?.query).toBe('удалённая работа');
    expect(view.modelCalls[0]?.cache?.exceedsPreviousPrompt).toBeNull();
  });

  it('стоимость тулов — по тулу и валюте; неизвестная цена модели учитывается отдельно', () => {
    const first = toolCall('s1', 'web_search');
    const second = toolCall('s2', 'web_search');
    const log = new EventLog()
      .add(sessionStarted())
      .add(modelRequest('request-1', 1))
      .add(
        modelResponse('request-1', {
          usage: usage(900, 0),
          toolCalls: [first, second],
          costUsd: null,
        }),
      )
      .add(toolCallEvent(first))
      .add(toolResult(first, 'success', 0.488))
      .add(toolCallEvent(second))
      .add(toolResult(second, 'success', 0.488));
    const { totals } = projectSession(log.events);

    expect(totals.toolCosts).toEqual([
      { toolName: 'web_search', currency: 'RUB', total: 0.976, calls: 2 },
    ]);
    expect(totals.unpricedModelRequests).toBe(1);
    expect(totals.modelCosts).toEqual([]);
  });

  it('событие error — сессия с ошибкой', () => {
    const log = new EventLog()
      .add(sessionStarted())
      .add({ type: 'error', message: 'Модель ответила ошибкой HTTP 403' });
    const view = projectSession(log.events);

    expect(view.status).toBe('failed');
    expect(view.errors).toEqual(['Модель ответила ошибкой HTTP 403']);
  });
});

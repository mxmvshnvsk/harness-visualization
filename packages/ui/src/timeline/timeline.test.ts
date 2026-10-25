import { describe, expect, it } from 'vitest';
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
} from '../projections/testEvents';
import { buildActions } from './actions';
import { computeFrame } from './frame';
import {
  buildSchedule,
  GAP_MS,
  MIN_DWELL_MS,
  realAt,
  stepTime,
  timeAt,
  TRAVEL_MS,
  WAIT_MAX_MS,
} from './schedule';

const context = { modelHost: 'api.deepseek.com' };
const search = toolCall('c1', 'kedr__search');
const web = toolCall('c2', 'web_search');

// В фабрике событий соседние события — через 100 мс.
function session(): EventLog {
  return new EventLog()
    .add(sessionStarted())
    .add({ type: 'user_message', text: 'удалёнка' })
    .add(modelRequest('r1', 1))
    .add({
      type: 'network_request',
      host: 'api.deepseek.com',
      route: 'direct',
      viaProxy: false,
      rule: null,
      proxyUrl: null,
    })
    .add(modelResponse('r1', { usage: usage(1963, 1792), toolCalls: [search, web] }))
    .add(toolCallEvent(search))
    .add(permissionEvaluated(search, 'allow'))
    .add(toolResult(search))
    .add(toolCallEvent(web))
    .add(permissionEvaluated(web, 'allow'))
    .add({
      type: 'network_request',
      host: 'searchapi.api.cloud.yandex.net',
      route: 'direct',
      viaProxy: false,
      rule: null,
      proxyUrl: null,
    })
    .add(toolResult(web, 'success', 0.488))
    .add({ type: 'assistant_message', text: 'До трёх дней.' });
}

describe('buildActions', () => {
  it('собирает действия по участникам, а не по событиям', () => {
    const actions = buildActions(session().events, context);

    // Вызов tool идёт через политику к исполнению, тул MCP-сервера — дальше, к серверу.
    expect(actions.map((action) => `${action.kind}:${action.route.join('>')}`)).toEqual([
      'message:user>loop',
      'exchange:loop>model',
      'exchange:loop>policy>tools>mcp',
      'inside:policy',
      'exchange:loop>policy>tools',
      'inside:policy',
      'exchange:tools>network',
      'message:loop>user',
    ]);
  });

  it('tool уходит к адресату после решения политики', () => {
    const actions = buildActions(session().events, context);
    const searchAction = actions.find((action) => action.id === 'tool:c1');

    // tool_call — шестое событие (500 мс), решение политики — седьмое (600 мс).
    expect(searchAction).toMatchObject({ start: 600, end: 700, back: 'success · 10 мс' });
  });

  it('запрос в интернет закрывается результатом tool, который в него ходил', () => {
    const network = buildActions(session().events, context).find(
      (action) => action.to === 'network',
    );
    expect(network).toMatchObject({ out: 'yandex.net · напрямую', start: 1000, end: 1100 });
  });
});

describe('buildSchedule', () => {
  it('у каждого момента есть время на полёт, у адресата — время постоять', () => {
    const schedule = buildSchedule(buildActions(session().events, context));
    const searchItem = schedule.actions.find((item) => item.action.id === 'tool:c1');

    expect(searchItem).toBeDefined();
    if (searchItem !== undefined) {
      // Три перехода: первый — TRAVEL_MS, два следующих — по половине.
      expect(searchItem.outTo - searchItem.outFrom).toBe(TRAVEL_MS * 2);
      expect(searchItem.backFrom).toBeGreaterThanOrEqual(searchItem.outTo + MIN_DWELL_MS);
    }
  });

  it('интернет идёт одновременно с web_search: полёт туда начинается, пока tool ещё ждёт', () => {
    const schedule = buildSchedule(buildActions(session().events, context));
    const webItem = schedule.actions.find((item) => item.action.id === 'tool:c2');
    const networkItem = schedule.actions.find((item) => item.action.to === 'network');

    expect(webItem?.backFrom).not.toBeNull();
    expect(networkItem?.outFrom).toBeLessThan(webItem?.backFrom ?? 0);
  });

  it('долгое ожидание сжимается, а время записи считается обратно', () => {
    const log = new EventLog()
      .add(sessionStarted())
      .add(modelRequest('r1', 1))
      .add({ ...modelResponse('r1', { usage: usage(900, 0), text: 'ответ' }) });
    const events = log.events.map((event, index) =>
      index === 2 ? { ...event, timestamp: '2026-10-25T09:38:30.000Z' } : event,
    );
    const schedule = buildSchedule(buildActions(events, context));
    const item = schedule.actions[0];

    expect(item?.backFrom ?? 0).toBeLessThanOrEqual((item?.outTo ?? 0) + GAP_MS + WAIT_MAX_MS);
    // Посреди ожидания время записи — между запросом и ответом.
    const middle = ((item?.outTo ?? 0) + (item?.backFrom ?? 0)) / 2;
    expect(realAt(schedule, middle)).toBeGreaterThan(200);
    expect(realAt(schedule, middle)).toBeLessThan(19_800);
    expect(timeAt(schedule, realAt(schedule, middle))).toBeCloseTo(middle, 0);
  });

  it('решение политики показано раньше, чем tool отправился', () => {
    const schedule = buildSchedule(buildActions(session().events, context));
    const policy = schedule.actions.find((item) => item.action.id === 'inside:7');
    const tool = schedule.actions.find((item) => item.action.id === 'tool:c1');

    expect(policy?.outFrom).toBeLessThan(tool?.outFrom ?? 0);
  });

  it('шаги кнопками — к началам моментов', () => {
    const schedule = buildSchedule(buildActions(session().events, context));
    const second = stepTime(schedule, 0, 'forward');

    expect(second).toBe(schedule.moments[1]);
    expect(stepTime(schedule, second, 'back')).toBe(0);
  });
});

describe('computeFrame', () => {
  it('пока модель думает — точка у модели, узел ждёт, подпись «туда» видна', () => {
    const schedule = buildSchedule(buildActions(session().events, context));
    const model = schedule.actions.find((item) => item.action.to === 'model');
    const time = ((model?.outTo ?? 0) + (model?.backFrom ?? 0)) / 2;
    const frame = computeFrame(schedule, time);

    expect(frame.parked.map((action) => action.to)).toEqual(['model']);
    expect(frame.waiting).toEqual([expect.objectContaining({ node: 'model', label: 'думает…' })]);
    expect(frame.caption?.what).toBe('Модель думает над шагом 1');
  });

  it('на обратном пути — точка на полосе «обратно» и подпись ответа', () => {
    const schedule = buildSchedule(buildActions(session().events, context));
    const model = schedule.actions.find((item) => item.action.to === 'model');
    const frame = computeFrame(schedule, (model?.backFrom ?? 0) + TRAVEL_MS / 2);

    expect(frame.dots).toEqual([expect.objectContaining({ lane: 'back', progress: 0.5 })]);
    expect(frame.caption?.what).toBe('Модель просит 2 тула');
  });

  it('к концу видно, кто был занят дольше', () => {
    const schedule = buildSchedule(buildActions(session().events, context));
    const frame = computeFrame(schedule, schedule.total);

    expect(frame.busyShare.model).toBeGreaterThan(frame.busyShare.mcp ?? 0);
  });
});

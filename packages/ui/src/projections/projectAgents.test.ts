import { describe, expect, it } from 'vitest';
import { projectAgents, reportTokens } from './projectAgents';
import {
  EventLog,
  modelRequest,
  modelResponse,
  subagentFinished,
  subagentStarted,
  toolCall,
  toolCallEvent,
  toolResult,
  usage,
} from './testEvents';

// Два поручения в одном шаге, субагенты работают одновременно.
function parallel(): EventLog {
  const first = toolCall('call-1', 'delegate_task', '{"agent":"researcher","task":"отпуска"}');
  const second = toolCall(
    'call-2',
    'delegate_task',
    '{"agent":"researcher","task":"командировки"}',
  );
  const search = toolCall('call-3', 'kedr__search', '{"query":"отпуск"}');
  return new EventLog()
    .add(modelRequest('main-1', 1))
    .add(modelResponse('main-1', { usage: usage(2000, 0), toolCalls: [first, second] }))
    .add(toolCallEvent(first))
    .add(toolCallEvent(second))
    .add(subagentStarted('researcher-1', 'call-1'))
    .add(subagentStarted('researcher-2', 'call-2'))
    .add(modelRequest('sub-1', 1), 'researcher-1')
    .add(modelRequest('sub-2', 1), 'researcher-2')
    .add(modelResponse('sub-1', { usage: usage(1200, 0), toolCalls: [search] }), 'researcher-1')
    .add(toolCallEvent(search), 'researcher-1')
    .add(modelResponse('sub-2', { usage: usage(1300, 0), text: 'отчёт 2' }), 'researcher-2')
    .add(subagentFinished('researcher-2', 'call-2'))
    .add(toolResult(search), 'researcher-1');
}

describe('projectAgents', () => {
  it('дорожка на агента: у главного — ожидание отчётов, у субагентов — свои шаги и тулы', () => {
    const { events } = parallel();
    const view = projectAgents(events, events.length);

    expect(view.lanes.map((lane) => [lane.id, lane.color])).toEqual([
      ['main', 'main'],
      ['researcher-1', 'one'],
      ['researcher-2', 'two'],
    ]);
    const [main, first, second] = view.lanes;
    expect(main?.segments.map((segment) => segment.kind)).toEqual(['model', 'wait', 'wait']);
    expect(first?.segments.map((segment) => [segment.kind, segment.end === null])).toEqual([
      ['model', false],
      ['tool', false],
    ]);
    expect(second?.segments[0]?.label).toBe('шаг 1: модель думает → отчёт');
    expect(first?.calls).toEqual([
      {
        toolCallId: 'call-3',
        toolName: 'kedr__search',
        query: 'отпуск',
        argumentsText: '{"query":"отпуск"}',
      },
    ]);
    expect([first?.inputTokens, second?.inputTokens, main?.inputTokens]).toEqual([
      1200, 1300, 2000,
    ]);
  });

  it('по курсору: незаконченное — без конца, субагенты ещё не начались — без шагов', () => {
    const { events } = parallel();
    const early = projectAgents(events, 8);

    expect(early.lanes.map((lane) => lane.segments.length)).toEqual([3, 1, 1]);
    expect(early.lanes[1]?.segments[0]?.end).toBeNull();
    expect(projectAgents(events, 3).lanes).toHaveLength(1);
  });

  it('оценивает отчёт той же формулой, что бюджет prompt', () => {
    const { events } = parallel();
    const [, second] = projectAgents(events, events.length).runs;
    if (second === undefined) {
      throw new Error('нет субагента');
    }
    expect(reportTokens(second, 3)).toBe(Math.round('отчёт researcher-2'.length / 3));
  });
});

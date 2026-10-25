import { describe, expect, it } from 'vitest';
import { projectDialog, turnStatus } from './projectDialog';
import { projectStages } from './projectStages';
import { projectSubagents, runAt } from './projectSubagents';
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

// Главный агент поручает два исследования в одном шаге; субагенты работают вперемешку.
function delegation(): EventLog {
  const first = toolCall('call-1', 'delegate_task', '{"agent":"researcher","task":"отпуска"}');
  const second = toolCall(
    'call-2',
    'delegate_task',
    '{"agent":"researcher","task":"командировки"}',
  );
  const read = toolCall('call-3', 'read_file', '{"path":"regulations/vacation.md"}');
  return new EventLog()
    .add({ type: 'user_message', text: 'сравни регламенты' })
    .add(modelRequest('main-1', 1))
    .add(modelResponse('main-1', { usage: usage(2000, 0), toolCalls: [first, second] }))
    .add(toolCallEvent(first))
    .add(toolCallEvent(second))
    .add(subagentStarted('researcher-1', 'call-1'))
    .add(subagentStarted('researcher-2', 'call-2'))
    .add(modelRequest('sub-1', 1), 'researcher-1')
    .add(modelRequest('sub-2', 1), 'researcher-2')
    .add(modelResponse('sub-1', { usage: usage(1200, 0), toolCalls: [read] }), 'researcher-1')
    .add(toolCallEvent(read), 'researcher-1')
    .add(modelResponse('sub-2', { usage: usage(1300, 0), text: 'отчёт 2' }), 'researcher-2')
    .add(subagentFinished('researcher-2', 'call-2'))
    .add(toolResult(read), 'researcher-1')
    .add(modelRequest('sub-3', 2), 'researcher-1')
    .add(modelResponse('sub-3', { usage: usage(1800, 0), text: 'отчёт 1' }), 'researcher-1')
    .add(subagentFinished('researcher-1', 'call-1', null))
    .add(toolResult(first, 'error'))
    .add(toolResult(second))
    .add(modelRequest('main-2', 2))
    .add(modelResponse('main-2', { usage: usage(2600, 0), text: 'Противоречие одно.' }))
    .add({ type: 'assistant_message', text: 'Противоречие одно.' });
}

describe('projectSubagents', () => {
  it('собирает поручения с итогом и цветом по порядку запуска', () => {
    const runs = projectSubagents(delegation().events);

    expect(
      runs.map((run) => [run.subagentId, run.parentToolCallId, run.status, run.color]),
    ).toEqual([
      ['researcher-1', 'call-1', 'failed', 'one'],
      ['researcher-2', 'call-2', 'done', 'two'],
    ]);
  });

  it('по курсору повтора знает, работает ли субагент', () => {
    const [run] = projectSubagents(delegation().events);
    if (run === undefined) {
      throw new Error('нет субагента');
    }
    expect([run.startedIndex, run.finishedIndex]).toEqual([5, 16]);
    expect(runAt(run, 5)).toBe('future');
    expect(runAt(run, 6)).toBe('running');
    expect(runAt(run, 17)).toBe('finished');
  });
});

describe('лимит шагов субагента', () => {
  it('отчёт по лимиту помечен', () => {
    const log = delegation();
    const events = [...log.events];
    const finished = events.findIndex((event) => event.type === 'subagent_finished');
    const limit = new EventLog().add(
      { type: 'iteration_limit_reached', limit: 6, setting: 'subagents', note: 'лимит' },
      'researcher-2',
    ).events[0];
    if (limit === undefined) {
      throw new Error('нет события');
    }
    events.splice(finished, 0, limit);
    const [first, second] = projectSubagents(events);

    expect([first?.limited, second?.limited]).toEqual([false, true]);
  });
});

describe('projectStages по агентам', () => {
  it('у главного агента — его шаги и строки поручений, без шагов субагентов', () => {
    const stages = projectStages(delegation().events);

    expect(stages.map((stage) => stage.title)).toEqual([
      'Подготовка',
      'Шаг 1 · agentStep',
      'Шаг 2 · agentStep',
      'Ответ пользователю',
    ]);
    const edges = stages[1]?.rows.flatMap((row) =>
      row.subagent === undefined ? [] : [`${row.subagent.id} ${row.subagent.edge}`],
    );
    expect(edges).toEqual([
      'researcher-1 start',
      'researcher-2 start',
      'researcher-2 end',
      'researcher-1 end',
    ]);
  });

  it('у субагента — поручение, его шаги и отчёт главному', () => {
    const stages = projectStages(delegation().events, 'researcher-1');

    expect(stages.map((stage) => [stage.id, stage.title])).toEqual([
      ['researcher-1-task', 'Поручение'],
      ['researcher-1-turn-1-step-1', 'Шаг 1 · agentStep'],
      ['researcher-1-turn-1-step-2', 'Шаг 2 · agentStep'],
      ['researcher-1-report', 'Отчёт главному агенту'],
    ]);
    expect(stages[0]?.firstIndex).toBe(5);
    expect(stages[3]?.rows.map((row) => row.text)).toEqual(['без отчёта: лимит шагов']);
  });
});

describe('projectDialog с субагентами', () => {
  it('шаги и тулы — главного агента, input — всех, поручения отдельно', () => {
    const [turn] = projectDialog(delegation().events);

    expect(turn).toMatchObject({ steps: 2, tools: 2, delegations: 2, inputTokens: 8900 });
  });

  it('строка «что делает сейчас» называет субагента', () => {
    const { events } = delegation();

    expect(turnStatus(events, 11)).toBe('субагент researcher-1: вызывает read_file');
    expect(turnStatus(events, 7)).toBe('поручает задачу субагенту researcher-2');
  });
});

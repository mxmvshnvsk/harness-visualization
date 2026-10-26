import { describe, expect, it } from 'vitest';
import type { HarnessEventPayload } from '@harness-visualization/harness';
import { projectOrchestration } from './projectOrchestration';
import { EventLog, subagentFinished, subagentStarted, toolCall, toolCallEvent } from './testEvents';

function reviewed(
  subagentId: string,
  taskId: string,
  verdict: 'accepted' | 'rework',
  round: number,
): HarnessEventPayload {
  return {
    type: 'task_reviewed',
    subagentId,
    taskId,
    verdict,
    comment: verdict === 'rework' ? 'нет пункта' : 'ок',
    round,
  };
}

function superagent(): EventLog {
  const first = toolCall(
    'call-1',
    'delegate_task',
    '{"agent":"researcher","task":"отпуска","taskId":"task-1"}',
  );
  const second = toolCall(
    'call-2',
    'delegate_task',
    '{"agent":"researcher","task":"командировки","taskId":"task-2"}',
  );
  return new EventLog()
    .add({ type: 'user_message', text: 'сравни' })
    .add({ type: 'orchestration_started', mode: 'superagent', steps: [], settings: {} })
    .add({
      type: 'plan_created',
      author: 'model',
      stepId: null,
      tasks: [
        { taskId: 'task-1', title: 'Отпуска', agent: 'researcher' },
        { taskId: 'task-2', title: 'Командировки', agent: 'researcher' },
        { taskId: 'task-3', title: 'FAQ', agent: 'researcher' },
      ],
    })
    .add(toolCallEvent(first))
    .add(toolCallEvent(second))
    .add(subagentStarted('researcher-1', 'call-1'))
    .add(subagentStarted('researcher-2', 'call-2'))
    .add(subagentFinished('researcher-1', 'call-1'))
    .add(subagentFinished('researcher-2', 'call-2'))
    .add(reviewed('researcher-1', 'task-1', 'accepted', 1))
    .add(reviewed('researcher-2', 'task-2', 'rework', 1))
    .add({
      type: 'subagent_resumed',
      subagentId: 'researcher-2',
      agent: 'researcher',
      feedback: 'нет пункта',
      round: 2,
    });
}

describe('projectOrchestration', () => {
  it('связывает задачи плана с поручениями и приёмкой', () => {
    const log = superagent();
    const view = projectOrchestration(log.events, log.events.length);
    expect(
      view?.tasks.map((task) => [task.taskId, task.state, task.runs.map((run) => run.subagentId)]),
    ).toEqual([
      ['task-1', 'accepted', ['researcher-1']],
      ['task-2', 'rework', ['researcher-2']],
      ['task-3', 'planned', []],
    ]);
    expect(view?.reworks).toBe(1);
  });

  it('доработка дописывает новый отчёт к тому же исполнителю', () => {
    const log = superagent()
      .add({
        ...subagentFinished('researcher-2', 'call-2', 'отчёт с пунктом'),
        round: 2,
      } as HarnessEventPayload)
      .add({
        type: 'task_reviewed',
        subagentId: 'researcher-2',
        taskId: 'task-2',
        verdict: 'accepted',
        comment: 'ок',
        round: 2,
      });
    const task = projectOrchestration(log.events, log.events.length)?.tasks[1];
    expect(task?.state).toBe('accepted');
    expect(task?.runs[0]?.reports).toEqual([
      { round: 1, report: 'отчёт researcher-2', feedback: null },
      { round: 2, report: 'отчёт с пунктом', feedback: 'нет пункта' },
    ]);
  });
});

describe('projectOrchestration: пайплайн', () => {
  it('шаги — из кода, задачи — по порядку исследователей', () => {
    const log = new EventLog()
      .add({
        type: 'orchestration_started',
        mode: 'pipeline',
        settings: {},
        steps: [
          { stepId: 'find', title: 'найти', kind: 'code' },
          { stepId: 'research', title: 'исследователи', kind: 'agents' },
        ],
      })
      .add({ type: 'pipeline_step_started', stepId: 'find', title: 'найти', kind: 'code' })
      .add({
        type: 'pipeline_step_finished',
        stepId: 'find',
        status: 'done',
        summary: 'vacation',
        durationMs: 200,
      })
      .add({
        type: 'plan_created',
        author: 'code',
        stepId: 'find',
        tasks: [{ taskId: 'task-1', title: 'Изучить vacation', agent: 'researcher' }],
      })
      .add({
        type: 'pipeline_step_started',
        stepId: 'research',
        title: 'исследователи',
        kind: 'agents',
      })
      .add({ ...subagentStarted('researcher-1', ''), stepId: 'research' } as HarnessEventPayload);
    const view = projectOrchestration(log.events, log.events.length);
    expect(view?.steps.map((step) => step.state)).toEqual(['done', 'running']);
    expect(view?.tasks[0]).toMatchObject({ author: 'code', state: 'running' });
  });
});

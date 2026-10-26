// Оркестрация хода (этап 6d): режим, шаги каркаса, план и что стало с каждой задачей — кому
// поручена, что вернулось, что решила приёмка. Берётся последний ход с оркестрацией: в диалоге
// каждый вопрос проходит её заново. Срез — до курсора повтора.

import type {
  HarnessEvent,
  OrchestrationMode,
  OrchestrationStepKind,
  PipelineStepStatus,
} from '@harness-visualization/harness';
import { projectSubagents, type SubagentRun } from './projectSubagents';

export type StepState = 'future' | 'running' | PipelineStepStatus;

export interface OrchestrationStepView {
  stepId: string;
  title: string;
  kind: OrchestrationStepKind;
  state: StepState;
  summary: string | null;
  durationMs: number | null;
}

export type TaskState = 'planned' | 'running' | 'reported' | 'rework' | 'accepted' | 'failed';

export interface TaskReview {
  subagentId: string;
  verdict: 'accepted' | 'rework';
  comment: string;
  round: number;
}

export interface OrchestrationTask {
  taskId: string;
  title: string;
  agent: string;
  // Кто поставил задачу: код харнесса или модель-оркестратор.
  author: 'code' | 'model';
  runs: SubagentRun[];
  reviews: TaskReview[];
  state: TaskState;
}

export interface OrchestrationView {
  mode: OrchestrationMode;
  steps: OrchestrationStepView[];
  tasks: OrchestrationTask[];
  // Поручения вне плана: оркестратор не указал taskId.
  unplanned: SubagentRun[];
  reworks: number;
  finished: boolean;
}

export function projectOrchestration(
  events: readonly HarnessEvent[],
  shown: number,
): OrchestrationView | null {
  const visible = events.slice(0, shown);
  const startIndex = visible.findLastIndex((event) => event.type === 'orchestration_started');
  const started = visible[startIndex];
  if (started?.type !== 'orchestration_started') {
    return null;
  }
  const turn = visible.slice(startIndex);
  const runs = projectSubagents(turn);
  const tasks = collectTasks(turn, runs);
  return {
    mode: started.mode,
    steps: collectSteps(started.steps, turn),
    tasks,
    unplanned: runs.filter((run) => !tasks.some((task) => task.taskId === run.taskId)),
    reworks: turn.filter((event) => event.type === 'subagent_resumed').length,
    finished: turn.some((event) => event.type === 'orchestration_finished'),
  };
}

type Started = Extract<HarnessEvent, { type: 'orchestration_started' }>;

function collectSteps(
  known: Started['steps'],
  turn: readonly HarnessEvent[],
): OrchestrationStepView[] {
  return known.map((step) => {
    const begun = turn.some(
      (event) => event.type === 'pipeline_step_started' && event.stepId === step.stepId,
    );
    const ended = turn.find(
      (event): event is Extract<HarnessEvent, { type: 'pipeline_step_finished' }> =>
        event.type === 'pipeline_step_finished' && event.stepId === step.stepId,
    );
    return {
      ...step,
      state: ended?.status ?? (begun ? 'running' : 'future'),
      summary: ended?.summary ?? null,
      durationMs: ended?.durationMs ?? null,
    };
  });
}

function collectTasks(turn: readonly HarnessEvent[], runs: SubagentRun[]): OrchestrationTask[] {
  const tasks: OrchestrationTask[] = [];
  for (const event of turn) {
    if (event.type === 'plan_created') {
      for (const task of event.tasks) {
        tasks.push({ ...task, author: event.author, runs: [], reviews: [], state: 'planned' });
      }
    }
    if (event.type === 'task_reviewed') {
      const task = tasks.find((item) => item.taskId === event.taskId);
      task?.reviews.push({
        subagentId: event.subagentId,
        verdict: event.verdict,
        comment: event.comment,
        round: event.round,
      });
    }
  }
  for (const task of tasks) {
    task.runs = runs.filter((run) => run.taskId === task.taskId);
    task.state = stateOf(task);
  }
  return tasks;
}

function stateOf(task: OrchestrationTask): TaskState {
  const run = task.runs.at(-1);
  if (run === undefined) {
    return 'planned';
  }
  const review = task.reviews.at(-1);
  if (run.status === 'running') {
    return review?.verdict === 'rework' ? 'rework' : 'running';
  }
  if (run.status === 'failed') {
    return 'failed';
  }
  return review?.verdict === 'accepted' ? 'accepted' : 'reported';
}

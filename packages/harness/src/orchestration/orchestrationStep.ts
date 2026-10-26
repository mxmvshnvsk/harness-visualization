// Шаг оркестрации, который задаёт код (пайплайн и каркас гибрида, этап 6d): событие начала,
// работа, событие конца с итогом и длительностью. Ошибка шага — тоже событие, потом наружу.

import type { AgentDependencies } from '../agent/agentDependencies.js';
import type { OrchestrationStep, PipelineStepStatus } from '../events/harnessEvents.js';

export interface StepOutcome<Value> {
  value: Value;
  status: PipelineStepStatus;
  summary: string;
}

export async function runStep<Value>(
  dependencies: AgentDependencies,
  known: OrchestrationStep,
  run: () => Promise<StepOutcome<Value>>,
): Promise<Value> {
  const { events } = dependencies;
  events.emit({ type: 'pipeline_step_started', ...known });
  const startedAt = performance.now();
  const durationMs = (): number => Math.round(performance.now() - startedAt);
  try {
    const outcome = await run();
    events.emit({
      type: 'pipeline_step_finished',
      stepId: known.stepId,
      status: outcome.status,
      summary: outcome.summary,
      durationMs: durationMs(),
    });
    return outcome.value;
  } catch (error) {
    events.emit({
      type: 'pipeline_step_finished',
      stepId: known.stepId,
      status: 'failed',
      summary: error instanceof Error ? error.message : String(error),
      durationMs: durationMs(),
    });
    throw error;
  }
}

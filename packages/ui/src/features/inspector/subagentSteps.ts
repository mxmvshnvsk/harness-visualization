// Шаги субагентов для инспектора (этап 6c): этапы каждого субагента строятся один раз на запись
// и раздаются строкам главного агента через контекст — строке не нужны все события.

import type { HarnessEvent } from '@harness-visualization/harness';
import { createContext, useContext, useMemo } from 'react';
import { projectStages, type Stage } from '../../projections/projectStages';
import { projectSubagents, type SubagentRun } from '../../projections/projectSubagents';

export interface SubagentSteps {
  run: SubagentRun;
  stages: Stage[];
}

export interface SubagentStepsValue {
  steps: ReadonlyMap<string, SubagentSteps>;
  // Пришли во вкладку по ссылке на поручение (из «Агентов») — его шаги раскрыты сразу.
  focused: string | null;
}

export const SubagentStepsContext = createContext<SubagentStepsValue>({
  steps: new Map(),
  focused: null,
});

export function useSubagentStepsOf(events: readonly HarnessEvent[]): Map<string, SubagentSteps> {
  return useMemo(
    () =>
      new Map(
        projectSubagents(events).map((run) => [
          run.subagentId,
          { run, stages: projectStages(events, run.subagentId) },
        ]),
      ),
    [events],
  );
}

export function useSubagentSteps(subagentId: string): SubagentSteps | null {
  return useContext(SubagentStepsContext).steps.get(subagentId) ?? null;
}

export function useFocusedSubagent(): string | null {
  return useContext(SubagentStepsContext).focused;
}

// Ссылка на вызов delegate_task — это ссылка на субагента, которого он запустил.
export function subagentOfCall(
  steps: ReadonlyMap<string, SubagentSteps>,
  toolCallId: string | null,
): string | null {
  if (toolCallId === null) {
    return null;
  }
  return (
    [...steps.values()].find((item) => item.run.parentToolCallId === toolCallId)?.run.subagentId ??
    null
  );
}

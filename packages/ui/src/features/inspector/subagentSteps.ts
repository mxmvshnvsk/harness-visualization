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

export const SubagentStepsContext = createContext<ReadonlyMap<string, SubagentSteps>>(new Map());

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
  return useContext(SubagentStepsContext).get(subagentId) ?? null;
}

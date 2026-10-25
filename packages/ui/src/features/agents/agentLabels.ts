// Метка агента (этап 6c): в сессии с поручениями каждое событие, шаг, поиск и вызов подписан —
// главный агент или какой субагент. В обычной сессии меток нет: подписывать некого.

import type { HarnessEvent } from '@harness-visualization/harness';
import { createContext, useContext, useMemo } from 'react';
import { projectSubagents, type AgentColor } from '../../projections/projectSubagents';

export interface AgentLabels {
  // false — субагентов в сессии нет, метки не нужны.
  enabled: boolean;
  // id субагентов по порядку запуска.
  subagents: string[];
  colorOf: (agentId: string | null) => AgentColor;
}

const NO_LABELS: AgentLabels = { enabled: false, subagents: [], colorOf: () => 'main' };

export const AgentLabelsContext = createContext<AgentLabels>(NO_LABELS);

export function useAgentLabelsOf(events: readonly HarnessEvent[]): AgentLabels {
  return useMemo(() => {
    const runs = projectSubagents(events);
    if (runs.length === 0) {
      return NO_LABELS;
    }
    const colors = new Map(runs.map((run) => [run.subagentId, run.color]));
    return {
      enabled: true,
      subagents: runs.map((run) => run.subagentId),
      colorOf: (agentId) => (agentId === null ? 'main' : (colors.get(agentId) ?? 'other')),
    };
  }, [events]);
}

export function useAgentLabels(): AgentLabels {
  return useContext(AgentLabelsContext);
}

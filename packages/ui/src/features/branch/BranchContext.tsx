// Ветка от шага (этап 9): какие шаги инспектора можно ветвить и как открыть панель ветки.
// Ветвить можно записанный трейс обычного агента: у оркестрации свои истории у исполнителей.

import type { HarnessEvent } from '@harness-visualization/harness';
import type { TraceSummary } from '@harness-visualization/server';
import { listBranchSteps, type BranchStep } from '@harness-visualization/harness/branch';
import { createContext, useContext, useMemo } from 'react';

export interface Branching {
  traceFile: string;
  // Шаг по requestId запроса к модели — так его знает карточка инспектора.
  stepOf: (requestId: string | null) => BranchStep | null;
  open: (step: BranchStep) => void;
}

export const BranchContext = createContext<Branching | null>(null);

export function useBranching(): Branching | null {
  return useContext(BranchContext);
}

// Переходы для веток: открыть запущенную ветку как живую сессию, открыть трейс из дерева,
// список трейсов — из него строится дерево веток.
export interface Navigation {
  openSession: (sessionId: string) => void;
  openTrace: (file: string) => void;
  traces: readonly TraceSummary[];
}

export const NavigationContext = createContext<Navigation | null>(null);

export function useBranchSteps(
  events: readonly HarnessEvent[],
  traceFile: string | null,
): BranchStep[] {
  return useMemo(() => {
    const started = events.find((event) => event.type === 'session_started');
    const plainAgent =
      started?.type === 'session_started' && (started.orchestration ?? null) === null;
    return traceFile !== null && plainAgent ? listBranchSteps(events) : [];
  }, [events, traceFile]);
}

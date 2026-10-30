import type { HarnessEvent } from '@harness-visualization/harness';
import type { ReactElement, ReactNode } from 'react';
import { AgentLabelsContext, useAgentLabelsOf } from '../agents/agentLabels';
import { ModelActorsProvider } from './ModelActor';

// Все панели одной записи получают общие подписи ролей и моделей.
export function StreamActors({
  events,
  children,
}: {
  events: readonly HarnessEvent[];
  children: ReactNode;
}): ReactElement {
  const agentLabels = useAgentLabelsOf(events);
  return (
    <ModelActorsProvider events={events}>
      <AgentLabelsContext.Provider value={agentLabels}>{children}</AgentLabelsContext.Provider>
    </ModelActorsProvider>
  );
}

// С какими опциями шла сессия — для чипов в шапке: кто ищет в базе знаний, effort, субагенты,
// Clean Workspace. Всё — из первых событий (session_started, workspace_prepared), поэтому чипы
// есть и у записанного трейса. Субагентов в трейсах до этапа 6c нет — и чипа нет.

import type { HarnessEvent } from '@harness-visualization/harness';

export interface SessionChip {
  label: string;
  // Опция, которую включают отдельно (субагенты, Clean Workspace), — выделена.
  on: boolean;
}

const RETRIEVAL: Record<string, string> = {
  tool: 'поиск: модель',
  auto: 'поиск: харнесс',
  rewrite: 'поиск: харнесс по запросу модели',
};

export function sessionChips(events: readonly HarnessEvent[]): SessionChip[] {
  const started = events.find((event) => event.type === 'session_started');
  if (started?.type !== 'session_started') {
    return [];
  }
  const workspace = events.find((event) => event.type === 'workspace_prepared');
  const subagents = started.subagents ?? null;
  return [
    ...(subagents === null
      ? []
      : [{ label: `субагенты: ${subagents.agents.join(', ')}`, on: true }]),
    ...(workspace?.type === 'workspace_prepared' && workspace.wasReset
      ? [{ label: 'clean workspace', on: true }]
      : []),
    { label: RETRIEVAL[started.retrievalMode] ?? `поиск: ${started.retrievalMode}`, on: false },
    { label: `effort ${started.reasoningEffort}`, on: false },
  ];
}

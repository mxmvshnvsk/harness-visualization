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
  const cleaned = workspace?.type === 'workspace_prepared' && workspace.wasReset;
  return [
    ...switchedOn(started, cleaned),
    ...searchChip(started),
    { label: `effort ${started.reasoningEffort}`, on: false },
  ];
}

type Started = Extract<HarnessEvent, { type: 'session_started' }>;

// Что включали отдельно: без демо-проекта, субагенты, Clean Workspace.
function switchedOn(started: Started, cleaned: boolean): SessionChip[] {
  const subagents = started.subagents ?? null;
  return [
    ...(started.demoProject === false ? [{ label: 'без демо-проекта', on: true }] : []),
    ...(subagents === null
      ? []
      : [{ label: `субагенты: ${subagents.agents.join(', ')}`, on: true }]),
    ...(cleaned ? [{ label: 'clean workspace', on: true }] : []),
  ];
}

// Без демо-проекта базы знаний нет — и чипа поиска нет.
function searchChip(started: Started): SessionChip[] {
  if (started.demoProject === false) {
    return [];
  }
  return [
    { label: RETRIEVAL[started.retrievalMode] ?? `поиск: ${started.retrievalMode}`, on: false },
  ];
}

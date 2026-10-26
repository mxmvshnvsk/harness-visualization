// С какими опциями шла сессия — для чипов в шапке: кто ищет в базе знаний, effort, субагенты,
// Clean Workspace, режим оркестрации (этап 6d). Всё — из первых событий (session_started, workspace_prepared), поэтому чипы
// есть и у записанного трейса. Субагентов в трейсах до этапа 6c нет — и чипа нет.

import type { HarnessEvent } from '@harness-visualization/harness';

export interface SessionChip {
  label: string;
  // Опция, которую включают отдельно (субагенты, Clean Workspace), — выделена.
  on: boolean;
}

const ORCHESTRATION: Record<string, string> = {
  pipeline: 'оркестрация: пайплайн',
  superagent: 'оркестрация: суперагент',
  hybrid: 'оркестрация: гибрид',
};

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

// Что включали отдельно: без демо-проекта, оркестрация, субагенты, Clean Workspace.
function switchedOn(started: Started, cleaned: boolean): SessionChip[] {
  const subagents = started.subagents ?? null;
  const orchestration = started.orchestration ?? null;
  return [
    ...(started.demoProject === false ? [{ label: 'без демо-проекта', on: true }] : []),
    ...(orchestration === null
      ? []
      : [{ label: ORCHESTRATION[orchestration] ?? `оркестрация: ${orchestration}`, on: true }]),
    ...(subagents === null
      ? []
      : [{ label: `субагенты: ${subagents.agents.join(', ')}`, on: true }]),
    ...(cleaned ? [{ label: 'clean workspace', on: true }] : []),
  ];
}

// Без демо-проекта базы знаний нет — и чипа поиска нет. В оркестрации режим поиска не действует:
// в пайплайне ищет код, у суперагента — исполнители своими тулами.
function searchChip(started: Started): SessionChip[] {
  if (started.demoProject === false || (started.orchestration ?? null) !== null) {
    return [];
  }
  return [
    { label: RETRIEVAL[started.retrievalMode] ?? `поиск: ${started.retrievalMode}`, on: false },
  ];
}

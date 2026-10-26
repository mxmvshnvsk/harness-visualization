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
    ...branchChip(events),
    ...switchedOn(started, cleaned, describeDelegation(events)),
    ...searchChip(started),
    { label: `effort ${started.reasoningEffort}`, on: false },
  ];
}

type Started = Extract<HarnessEvent, { type: 'session_started' }>;

// Что включали отдельно: без демо-проекта, оркестрация, субагенты, Clean Workspace.
function switchedOn(started: Started, cleaned: boolean, delegation: Delegation): SessionChip[] {
  const subagents = started.subagents ?? null;
  const orchestration = started.orchestration ?? null;
  return [
    ...(started.demoProject === false ? [{ label: 'без демо-проекта', on: true }] : []),
    ...(orchestration === null
      ? []
      : [{ label: ORCHESTRATION[orchestration] ?? `оркестрация: ${orchestration}`, on: true }]),
    ...(subagents === null ? [] : [subagentsChip(subagents.agents, delegation)]),
    ...(cleaned ? [{ label: 'clean workspace', on: true }] : []),
  ];
}

// Ветка (этап 9): от какой записи, с какого шага и что поменяли.
function branchChip(events: readonly HarnessEvent[]): SessionChip[] {
  const branch = events.find((event) => event.type === 'branch_started');
  if (branch?.type !== 'branch_started') {
    return [];
  }
  const source = branch.sourceSessionId ?? branch.sourceTracePath;
  const change =
    branch.change.kind === 'replay' ? 'переиграть' : `результат ${branch.change.toolName} изменён`;
  return [{ label: `⑂ ветка от ${source} · шаг ${String(branch.step)} · ${change}`, on: true }];
}

// Поручали ли субагентам: «Субагенты» — не обещание поручений, а тул в меню модели,
// и решает она сама (по вопросу автора, 26.10.2026: в сессии 61a6fdd0 субагенты были
// включены, а модель справилась сама — и вкладки «Агенты» не было).
interface Delegation {
  tasks: number;
  // Агент ответил: если поручений не было, их уже и не будет в этом ходе.
  answered: boolean;
}

function describeDelegation(events: readonly HarnessEvent[]): Delegation {
  return {
    tasks: events.filter((event) => event.type === 'subagent_started').length,
    answered: events.some(
      (event) => event.type === 'assistant_message' || event.type === 'awaiting_question',
    ),
  };
}

function subagentsChip(agents: readonly string[], delegation: Delegation): SessionChip {
  const label = `субагенты: ${agents.join(', ')}`;
  if (delegation.tasks > 0) {
    return { label: `${label} · поручений ${String(delegation.tasks)}`, on: true };
  }
  if (delegation.answered) {
    return { label: `${label} · не понадобились`, on: false };
  }
  return { label, on: true };
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

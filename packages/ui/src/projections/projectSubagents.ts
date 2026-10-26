// Субагенты сессии (этап 6c): кому главный агент что поручил, чем кончилось и сколько стоило.
// События субагента несут agentId; у главного агента его нет. Цвет — по порядку запуска:
// у первых двух свои (палитра проверена validate_palette.js из скилла dataviz, Anthropic),
// дальше — нейтральный: различать их помогает подпись с id, а не новый оттенок.

import type { HarnessEvent, TokenUsage } from '@harness-visualization/harness';

// code — дорожка шагов каркаса оркестрации (этап 6d): это работа кода, а не агента.
export type AgentColor = 'main' | 'one' | 'two' | 'other' | 'code';

export interface SubagentRun {
  subagentId: string;
  agent: string;
  task: string;
  parentToolCallId: string;
  toolNames: string[];
  color: AgentColor;
  // Номера событий начала и конца; null — субагент ещё работает.
  startedIndex: number;
  finishedIndex: number | null;
  status: 'running' | 'done' | 'failed';
  // Отчёт написан по лимиту шагов: харнесс попросил закончить.
  limited: boolean;
  report: string | null;
  errorMessage: string | null;
  modelRequests: number;
  usage: TokenUsage | null;
  durationMs: number | null;
  // Задача плана (этап 6d): из taskId поручения или, в пайплайне, по порядку исследователей.
  taskId: string | null;
  // Шаг оркестрации, на котором поручил код; null — поручил агент тулом.
  stepId: string | null;
  // Отчёты по кругам: доработки после возврата оркестратором дописывают новые (этап 6d.2).
  reports: SubagentReport[];
  // Начала доработок — номера событий subagent_resumed: с них отрезки на дорожке — доработка.
  reworkIndexes: number[];
}

export interface SubagentReport {
  round: number;
  report: string | null;
  feedback: string | null;
}

const COLORS: readonly AgentColor[] = ['one', 'two'];

export function isMainEvent(event: HarnessEvent): boolean {
  return event.agentId === undefined;
}

interface Collected {
  runs: SubagentRun[];
  // Поручение тулом delegate_task с taskId — по id вызова находим задачу плана.
  taskIds: Map<string, string>;
}

type EventOf<Type extends HarnessEvent['type']> = Extract<HarnessEvent, { type: Type }>;

export function projectSubagents(events: readonly HarnessEvent[]): SubagentRun[] {
  const collected: Collected = { runs: [], taskIds: new Map() };
  events.forEach((event, index) => {
    switch (event.type) {
      case 'tool_call':
        rememberTaskId(collected, event);
        break;
      case 'subagent_started':
        start(collected, event, index);
        break;
      case 'subagent_resumed':
        resume(collected.runs, event, index);
        break;
      case 'subagent_finished':
        finish(collected.runs, event, index);
        break;
      case 'iteration_limit_reached':
        markLimited(collected.runs, event);
        break;
      default:
        break;
    }
  });
  numberPipelineTasks(collected.runs);
  return collected.runs;
}

function rememberTaskId(collected: Collected, event: EventOf<'tool_call'>): void {
  const taskId = event.toolName === 'delegate_task' ? taskIdOf(event.arguments) : null;
  if (taskId !== null) {
    collected.taskIds.set(event.toolCallId, taskId);
  }
}

function start(collected: Collected, event: EventOf<'subagent_started'>, index: number): void {
  const { runs } = collected;
  runs.push({
    subagentId: event.subagentId,
    agent: event.agent,
    task: event.task,
    parentToolCallId: event.parentToolCallId,
    toolNames: event.toolNames,
    color: COLORS[runs.length] ?? 'other',
    startedIndex: index,
    finishedIndex: null,
    status: 'running',
    limited: false,
    report: null,
    errorMessage: null,
    modelRequests: 0,
    usage: null,
    durationMs: null,
    taskId: collected.taskIds.get(event.parentToolCallId) ?? null,
    stepId: event.stepId ?? null,
    reports: [{ round: 1, report: null, feedback: null }],
    reworkIndexes: [],
  });
}

// Доработка: тот же субагент снова работает, его следующий отчёт — новый круг.
function resume(runs: SubagentRun[], event: EventOf<'subagent_resumed'>, index: number): void {
  const run = runs.find((item) => item.subagentId === event.subagentId);
  if (run === undefined) {
    return;
  }
  run.status = 'running';
  run.finishedIndex = null;
  run.reworkIndexes.push(index);
  run.reports.push({ round: event.round, report: null, feedback: event.feedback });
}

function finish(runs: SubagentRun[], event: EventOf<'subagent_finished'>, index: number): void {
  const run = runs.find((item) => item.subagentId === event.subagentId);
  if (run === undefined) {
    return;
  }
  Object.assign(run, {
    finishedIndex: index,
    status: event.status,
    report: event.report,
    errorMessage: event.errorMessage,
    modelRequests: event.modelRequests,
    usage: event.usage,
    durationMs: event.durationMs,
  });
  const round = run.reports.find((item) => item.round === (event.round ?? 1));
  if (round !== undefined) {
    round.report = event.report;
  }
}

function markLimited(runs: SubagentRun[], event: EventOf<'iteration_limit_reached'>): void {
  const limited = runs.find((item) => item.subagentId === event.agentId);
  if (limited !== undefined) {
    limited.limited = true;
  }
}

// В пайплайне задачи поручает код по порядку плана: task-1 — первому исследователю шага.
function numberPipelineTasks(runs: SubagentRun[]): void {
  const byStep = runs.filter((run) => run.stepId !== null && run.taskId === null);
  byStep.forEach((run, index) => {
    run.taskId = `task-${String(index + 1)}`;
  });
}

function taskIdOf(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || !('taskId' in value)) {
    return null;
  }
  const { taskId } = value;
  return typeof taskId === 'string' ? taskId : null;
}

// Что видно на месте повтора: до старта субагента нет, после конца — готов.
export function runAt(run: SubagentRun, shown: number): 'future' | 'running' | 'finished' {
  if (shown <= run.startedIndex) {
    return 'future';
  }
  return run.finishedIndex !== null && shown > run.finishedIndex ? 'finished' : 'running';
}

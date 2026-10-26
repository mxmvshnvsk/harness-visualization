// Тулы оркестратора-суперагента (этап 6d.2): составить план, поручить задачу, принять отчёт
// или вернуть его на доработку. Решает модель; харнесс только исполняет и записывает в трейс.
// Подход — orchestrator-workers и evaluator-optimizer из статьи Anthropic «Building effective
// agents»: https://www.anthropic.com/engineering/building-effective-agents

import { z } from 'zod';
import type { AgentDependencies } from '../agent/agentDependencies.js';
import type { PlannedTask } from '../events/harnessEvents.js';
import type { SubagentsSettings, SuperagentSettings } from '../settings/settingsSchema.js';
import { createDelegateTool } from '../subagents/createDelegateTool.js';
import { resumeSubagent, type SubagentRun } from '../subagents/runSubagent.js';
import { defineTool } from '../tools/defineTool.js';
import { ToolError } from '../tools/ToolError.js';
import type { Tool, ToolOutput } from '../tools/toolTypes.js';

export const PLAN_TOOL_NAME = 'plan_tasks';
export const REVIEW_TOOL_NAME = 'review_report';

// Что оркестратор успел сделать за ход — для итога orchestration_finished.
export interface SuperagentState {
  runs: Map<string, { run: SubagentRun; taskId: string | null }>;
  // Задачи плана по названию — чтобы повторный plan_tasks не плодил дубли (прогон bbd5a21e).
  plan: Map<string, PlannedTask>;
  reworks: number;
  // Чьи последние отчёты приняты — гибрид проверяет, что приёмка прошла по всем (этап 6d.3).
  accepted: Set<string>;
  // Сколько поручений начато — для лимита кода.
  delegations: number;
  // Лимит кода на число задач и поручений (гибрид); null — решает модель (суперагент).
  maxTasks: number | null;
  // На каком шаге каркаса составлен план (гибрид); null — шагов нет (суперагент).
  planStepId: string | null;
}

export function createSuperagentState(
  maxTasks: number | null = null,
  planStepId: string | null = null,
): SuperagentState {
  return {
    planStepId,
    runs: new Map(),
    plan: new Map(),
    reworks: 0,
    accepted: new Set(),
    delegations: 0,
    maxTasks,
  };
}

// Последний отчёт субагента — последнее сообщение модели в его истории.
export function lastReport(run: SubagentRun): string | null {
  const message = run.messages.at(-1);
  return message?.role === 'assistant' &&
    typeof message.content === 'string' &&
    message.content !== ''
    ? message.content
    : null;
}

// Название задачи без регистра, пометок в скобках и лишних пробелов: «… (выполнено)» — та же задача.
function taskKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/\([^)]*\)/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function createSuperagentTools(
  subagents: SubagentsSettings,
  settings: SuperagentSettings,
  state: SuperagentState,
  dependenciesOf: () => AgentDependencies,
): Tool[] {
  const delegate = createDelegateTool(subagents, dependenciesOf, {
    onRun: (run, taskId) => {
      state.runs.set(run.assignment.subagentId, { run, taskId });
    },
  });
  if (delegate === null) {
    throw new Error('Для суперагента нужен хотя бы один субагент в subagents.agents');
  }
  return [
    createPlanTool(subagents, state, dependenciesOf),
    limitDelegations(delegate, state),
    createReviewTool(settings, state, dependenciesOf),
  ];
}

// Лимит кода на поручения (гибрид): считаем при подготовке вызова — поручения одного шага идут
// одновременно, и считать по законченным было бы поздно.
function limitDelegations(delegate: Tool, state: SuperagentState): Tool {
  if (state.maxTasks === null) {
    return delegate;
  }
  const maxTasks = state.maxTasks;
  return {
    ...delegate,
    prepare(rawArguments) {
      if (state.delegations >= maxTasks) {
        throw new ToolError(
          `Лимит кода: не больше ${String(maxTasks)} поручений за ход (orchestration.hybrid.maxTasks)`,
        );
      }
      state.delegations += 1;
      return delegate.prepare(rawArguments);
    },
  };
}

function createPlanTool(
  subagents: SubagentsSettings,
  state: SuperagentState,
  dependenciesOf: () => AgentDependencies,
): Tool {
  const agents = Object.keys(subagents.agents);
  return defineTool({
    name: PLAN_TOOL_NAME,
    description: [
      'Записать план: на какие подзадачи разбить задачу пользователя и кому поручить каждую.',
      'Подзадачи — независимые, чтобы их можно было делать одновременно. Тул возвращает номера',
      'задач — указывай их в delegate_task. Чтобы дополнить план, вызови тул ещё раз только с новыми',
      'задачами: уже поставленные остаются в плане, повторять их не нужно.',
    ].join('\n'),
    argumentsSchema: z.object({
      tasks: z
        .array(
          z.object({
            title: z.string().min(1).describe('Что сделать — коротко'),
            agent: z
              .string()
              .min(1)
              .describe(`Кому: ${agents.join(', ')}`),
          }),
        )
        .min(1),
    }),
    effects: ['delegate'],
    describeAction: ({ tasks }) => `План из ${String(tasks.length)} задач`,
    execute({ tasks }) {
      const { added, known, dropped } = addToPlan(state, tasks);
      if (added.length > 0) {
        dependenciesOf().events.emit({
          type: 'plan_created',
          author: 'model',
          stepId: state.planStepId,
          tasks: added,
        });
      }
      return Promise.resolve(describePlan(added, known, dropped, state.maxTasks));
    },
  });
}

interface PlanChange {
  added: PlannedTask[];
  known: PlannedTask[];
  dropped: string[];
}

function addToPlan(state: SuperagentState, tasks: { title: string; agent: string }[]): PlanChange {
  const change: PlanChange = { added: [], known: [], dropped: [] };
  for (const task of tasks) {
    const existing = state.plan.get(taskKey(task.title));
    if (existing !== undefined) {
      change.known.push(existing);
    } else if (state.maxTasks !== null && state.plan.size >= state.maxTasks) {
      change.dropped.push(task.title);
    } else {
      const planned = {
        taskId: `task-${String(state.plan.size + 1)}`,
        title: task.title,
        agent: task.agent,
      };
      state.plan.set(taskKey(task.title), planned);
      change.added.push(planned);
    }
  }
  return change;
}

// Вернуть на доработку: замечание — в историю того же субагента, его новый отчёт — оркестратору.
async function sendBack(
  state: SuperagentState,
  run: SubagentRun,
  comment: string,
  dependencies: AgentDependencies,
): Promise<ToolOutput> {
  const { subagentId } = run.assignment;
  state.accepted.delete(subagentId);
  state.reworks += 1;
  const outcome = await resumeSubagent(run, `Замечание оркестратора: ${comment}`, dependencies);
  if (outcome.report === null) {
    throw new ToolError(
      `Субагент ${subagentId} не доработал: ${outcome.errorMessage ?? 'причина неизвестна'}`,
    );
  }
  return {
    content: `Отчёт ${subagentId} после доработки:\n${outcome.report}`,
    details: { subagentId, round: run.round },
  };
}

function describePlan(
  added: PlannedTask[],
  known: PlannedTask[],
  dropped: string[],
  maxTasks: number | null,
): string {
  const line = (task: PlannedTask): string => `${task.taskId} → ${task.agent}: ${task.title}`;
  return [
    ...(added.length === 0 ? ['Новых задач нет.'] : ['Добавлено в план:', ...added.map(line)]),
    ...(known.length === 0 ? [] : ['Уже в плане, не добавлены повторно:', ...known.map(line)]),
    ...(dropped.length === 0
      ? []
      : [
          `Лимит кода — не больше ${String(maxTasks)} задач, не добавлены:`,
          ...dropped.map((title) => `- ${title}`),
        ]),
  ].join('\n');
}

function createReviewTool(
  settings: SuperagentSettings,
  state: SuperagentState,
  dependenciesOf: () => AgentDependencies,
): Tool {
  return defineTool({
    name: REVIEW_TOOL_NAME,
    description: [
      'Принять отчёт субагента или вернуть его на доработку.',
      'accept — отчёт отвечает на поручение, у фактов есть источники.',
      `rework — с конкретным замечанием, что доделать; тот же субагент доработает в своей истории`,
      `и вернёт новый отчёт. Вернуть один отчёт можно не больше ${String(settings.maxReworks)} раз.`,
    ].join('\n'),
    argumentsSchema: z.object({
      subagentId: z.string().min(1).describe('Чей отчёт: id из заголовка отчёта, researcher-1'),
      verdict: z.enum(['accept', 'rework']),
      comment: z.string().min(1).describe('Почему принят или что именно доделать'),
    }),
    effects: ['delegate'],
    describeAction: ({ subagentId, verdict }) =>
      `${verdict === 'accept' ? 'Принять' : 'Вернуть на доработку'} отчёт ${subagentId}`,
    async execute({ subagentId, verdict, comment }) {
      const entry = state.runs.get(subagentId);
      if (entry === undefined) {
        throw new ToolError(
          `Субагента «${subagentId}» нет: принимать можно только отчёты этого хода`,
        );
      }
      const { run, taskId } = entry;
      const dependencies = dependenciesOf();
      if (verdict === 'rework' && run.round > settings.maxReworks) {
        throw new ToolError(
          `Лимит доработок исчерпан (${String(settings.maxReworks)}): прими отчёт ${subagentId} или обойдись без него`,
        );
      }
      dependencies.events.emit({
        type: 'task_reviewed',
        subagentId,
        taskId,
        verdict: verdict === 'accept' ? 'accepted' : 'rework',
        comment,
        round: run.round,
      });
      if (verdict === 'accept') {
        state.accepted.add(subagentId);
        return `Отчёт ${subagentId} принят.`;
      }
      return sendBack(state, run, comment, dependencies);
    },
  });
}

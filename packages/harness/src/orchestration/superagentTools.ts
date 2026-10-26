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
import type { Tool } from '../tools/toolTypes.js';

export const PLAN_TOOL_NAME = 'plan_tasks';
export const REVIEW_TOOL_NAME = 'review_report';

// Что оркестратор успел сделать за ход — для итога orchestration_finished.
export interface SuperagentState {
  runs: Map<string, { run: SubagentRun; taskId: string | null }>;
  plannedTasks: number;
  reworks: number;
}

export function createSuperagentState(): SuperagentState {
  return { runs: new Map(), plannedTasks: 0, reworks: 0 };
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
    delegate,
    createReviewTool(settings, state, dependenciesOf),
  ];
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
      'Подзадачи — независимые, чтобы их можно было делать одновременно. План можно уточнить',
      'новым вызовом. Тул возвращает номера задач — указывай их в delegate_task.',
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
      const planned: PlannedTask[] = tasks.map((task) => {
        state.plannedTasks += 1;
        return {
          taskId: `task-${String(state.plannedTasks)}`,
          title: task.title,
          agent: task.agent,
        };
      });
      dependenciesOf().events.emit({
        type: 'plan_created',
        author: 'model',
        stepId: null,
        tasks: planned,
      });
      return Promise.resolve(
        [
          'План записан:',
          ...planned.map((task) => `${task.taskId} → ${task.agent}: ${task.title}`),
        ].join('\n'),
      );
    },
  });
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
        return `Отчёт ${subagentId} принят.`;
      }
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
    },
  });
}

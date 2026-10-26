// Тул delegate_task (этап 6c): главный агент поручает задачу субагенту и получает его отчёт как
// результат тула. Есть, только если в harness.config.json описан хотя бы один субагент.

import { z } from 'zod';
import type { AgentDependencies } from '../agent/agentDependencies.js';
import type { SubagentsSettings } from '../settings/settingsSchema.js';
import { defineTool } from '../tools/defineTool.js';
import { ToolError } from '../tools/ToolError.js';
import type { Tool } from '../tools/toolTypes.js';
import { DELEGATE_TOOL_NAME } from './delegateToolName.js';
import { runSubagent, type SubagentRun } from './runSubagent.js';

const ACTION_PREVIEW_LENGTH = 80;

// Зависимости агента собираются после тулов, поэтому тул получает их функцией — к моменту
// вызова они уже есть.
// Для суперагента (этап 6d.2): поручение помечается задачей плана, а работа субагента
// сохраняется — по ней оркестратор потом примет отчёт или вернёт его на доработку.
export interface DelegateOptions {
  onRun: (run: SubagentRun, taskId: string | null) => void;
}

export function createDelegateTool(
  settings: SubagentsSettings,
  dependenciesOf: () => AgentDependencies,
  options: DelegateOptions | null = null,
): Tool | null {
  const entries = Object.entries(settings.agents);
  const [first, ...rest] = entries.map(([name]) => name);
  if (first === undefined) {
    return null;
  }
  let started = 0;
  return defineTool({
    name: DELEGATE_TOOL_NAME,
    description: [
      'Поручить задачу субагенту. Субагент работает в своей истории со своими тулами и возвращает',
      'короткий отчёт — он и будет результатом. Диалога субагент не видит: всё нужное пиши в task.',
      'Независимые поручения давай в одном шаге несколькими вызовами.',
      'Субагенты:',
      ...entries.map(([name, agent]) => `- ${name}: ${agent.description}`),
    ].join('\n'),
    argumentsSchema: z.object({
      agent: z.enum([first, ...rest]).describe('Кому поручить'),
      task: z
        .string()
        .min(1)
        .describe('Поручение целиком: что найти или сделать и в каком виде вернуть'),
      taskId: z.string().optional().describe('Задача плана, если план составлен: task-1'),
    }),
    effects: ['delegate'],
    describeAction: ({ agent, task }) =>
      `Поручить субагенту «${agent}»: ${task.slice(0, ACTION_PREVIEW_LENGTH)}`,
    async execute({ agent, task, taskId }, context) {
      started += 1;
      const subagentId = `${agent}-${String(started)}`;
      const agentSettings = settings.agents[agent];
      if (agentSettings === undefined) {
        throw new ToolError(`Субагента «${agent}» нет`);
      }
      const { run, ...outcome } = await runSubagent(
        {
          subagentId,
          agent,
          settings: agentSettings,
          task,
          parentToolCallId: context.toolCallId ?? '',
        },
        dependenciesOf(),
      );
      options?.onRun(run, taskId ?? null);
      if (outcome.report === null) {
        throw new ToolError(
          `Субагент «${agent}» не вернул отчёт: ${outcome.errorMessage ?? 'причина неизвестна'}`,
        );
      }
      // Суперагенту нужен id субагента, чтобы принять отчёт или вернуть его: он — в заголовке.
      const content = options === null ? outcome.report : `Отчёт ${subagentId}:\n${outcome.report}`;
      return { content, details: { subagentId, taskId: taskId ?? null } };
    },
  });
}

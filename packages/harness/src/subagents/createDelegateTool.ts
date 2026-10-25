// Тул delegate_task (этап 6c): главный агент поручает задачу субагенту и получает его отчёт как
// результат тула. Есть, только если в harness.config.json описан хотя бы один субагент.

import { z } from 'zod';
import type { AgentDependencies } from '../agent/agentDependencies.js';
import type { SubagentsSettings } from '../settings/settingsSchema.js';
import { defineTool } from '../tools/defineTool.js';
import { ToolError } from '../tools/ToolError.js';
import type { Tool } from '../tools/toolTypes.js';
import { DELEGATE_TOOL_NAME } from './delegateToolName.js';
import { runSubagent } from './runSubagent.js';

const ACTION_PREVIEW_LENGTH = 80;

// Зависимости агента собираются после тулов, поэтому тул получает их функцией — к моменту
// вызова они уже есть.
export function createDelegateTool(
  settings: SubagentsSettings,
  dependenciesOf: () => AgentDependencies,
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
    }),
    effects: ['delegate'],
    describeAction: ({ agent, task }) =>
      `Поручить субагенту «${agent}»: ${task.slice(0, ACTION_PREVIEW_LENGTH)}`,
    async execute({ agent, task }, context) {
      started += 1;
      const subagentId = `${agent}-${String(started)}`;
      const agentSettings = settings.agents[agent];
      if (agentSettings === undefined) {
        throw new ToolError(`Субагента «${agent}» нет`);
      }
      const outcome = await runSubagent(
        {
          subagentId,
          agent,
          settings: agentSettings,
          task,
          parentToolCallId: context.toolCallId ?? '',
        },
        dependenciesOf(),
      );
      if (outcome.report === null) {
        throw new ToolError(
          `Субагент «${agent}» не вернул отчёт: ${outcome.errorMessage ?? 'причина неизвестна'}`,
        );
      }
      return { content: outcome.report, details: { subagentId } };
    },
  });
}

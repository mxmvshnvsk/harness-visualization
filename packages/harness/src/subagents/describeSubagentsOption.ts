// Что форма новой сессии показывает про субагентов (этап 6c): включены ли по умолчанию, кто есть
// и сколько токенов добавит delegate_task в каждый запрос. Оценка — той же формулой, что бюджет
// prompt: символы JSON описания тула ÷ context.charsPerToken.

import type { HarnessSettings } from '../settings/settingsSchema.js';
import type { AgentDependencies } from '../agent/agentDependencies.js';
import { createDelegateTool } from './createDelegateTool.js';

export interface SubagentsOption {
  enabledByDefault: boolean;
  agents: string[];
  parallel: boolean;
  // null — субагентов в настройках нет, включать нечего.
  delegateToolTokens: number | null;
}

export function describeSubagentsOption(settings: HarnessSettings): SubagentsOption {
  const { subagents, context } = settings;
  const tool = createDelegateTool(subagents, unreachable);
  const definition =
    tool === null
      ? null
      : {
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parametersSchema,
          },
        };
  return {
    enabledByDefault: subagents.enabled,
    agents: Object.keys(subagents.agents),
    parallel: subagents.parallel,
    delegateToolTokens:
      definition === null
        ? null
        : Math.round(JSON.stringify(definition).length / context.charsPerToken),
  };
}

// Тул здесь только описывают — выполнять его некому.
function unreachable(): AgentDependencies {
  throw new Error('delegate_task здесь не выполняется');
}

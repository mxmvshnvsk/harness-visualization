// Первый ход ветки (этап 9): шаги 1…N-1 — replay из исходного трейса, с шага N — новый прогон.
// История шага N кладётся в диалог как есть (с правкой), дальше крутится обычный цикл агента:
// запросы к модели, тулы и политика по-настоящему. Следующие вопросы диалога — как обычно.

import type { AgentDependencies } from '../agent/agentDependencies.js';
import { runAgentLoop } from '../agent/agentLoop.js';
import type { TurnOptions } from '../agent/runAgentTurn.js';
import type { BranchStartedPayload, BranchChange } from '../events/harnessEvents.js';
import type { ChatMessage } from '../model/chatTypes.js';

export interface BranchStart extends Pick<
  BranchStartedPayload,
  'sourceModel' | 'targetModel' | 'historyAdapted' | 'historyActors'
> {
  sourceTracePath: string;
  sourceSessionId: string | null;
  step: number;
  // Шаг внутри своего хода: с него продолжается нумерация и считается лимит шагов.
  iteration: number;
  // Вопрос пользователя исходного хода — в «Диалоге» ветка начинается с него.
  question: string;
  messages: ChatMessage[];
  change: BranchChange;
}

export async function runBranchTurn(
  branch: BranchStart,
  dependencies: AgentDependencies,
  options: TurnOptions,
  conversation: ChatMessage[],
): Promise<string> {
  const { events, tools } = dependencies;
  events.emit({
    type: 'branch_started',
    sourceModel: branch.sourceModel,
    targetModel: branch.targetModel,
    historyAdapted: branch.historyAdapted,
    historyActors: branch.historyActors,
    sourceTracePath: branch.sourceTracePath,
    sourceSessionId: branch.sourceSessionId,
    step: branch.step,
    replayedSteps: branch.step - 1,
    replayedMessages: branch.messages.length,
    change: branch.change,
  });
  events.emit({ type: 'user_message', text: branch.question });
  restoreLoadedSkills(branch.messages, dependencies);
  conversation.push(...branch.messages);
  events.emit({ type: 'prompt_assembled', messages: [...conversation], toolNames: tools.names() });
  const answer = await runAgentLoop(conversation, dependencies, {
    reasoningEffort: options.reasoningEffort,
    maxIterations: options.maxIterations,
    limitSetting: 'agent.maxIterations',
    startIteration: branch.iteration,
  });
  events.emit({ type: 'assistant_message', text: answer });
  return answer;
}

// Скиллы, которые модель загрузила на шагах replay, остаются загруженными: иначе read_skill_file
// на новом шаге ответил бы «скилл не загружен», хотя его инструкция уже в истории.
function restoreLoadedSkills(messages: ChatMessage[], dependencies: AgentDependencies): void {
  for (const message of messages) {
    if (message.role !== 'assistant') {
      continue;
    }
    for (const call of message.toolCalls) {
      const name = skillNameOf(call.name, call.argumentsText);
      const skill = name === null ? null : dependencies.skills.find(name);
      if (skill !== null) {
        dependencies.skills.load(skill, 'model');
      }
    }
  }
}

function skillNameOf(toolName: string, argumentsText: string): string | null {
  if (toolName !== 'load_skill') {
    return null;
  }
  try {
    const value = JSON.parse(argumentsText) as { name?: unknown };
    return typeof value.name === 'string' ? value.name : null;
  } catch {
    return null;
  }
}

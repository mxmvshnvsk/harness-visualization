// Суперагент (этап 6d.2): порядок работы решает модель-оркестратор — план, поручения, приёмка,
// доработка, итог. Шагов заранее не знает никто: сколько поручений и доработок, решает модель.
// Это цикл того же агента, но с другими тулами и system prompt: оркестратор только планирует,
// поручает и принимает, а читают документы исполнители.

import type { AgentDependencies } from '../agent/agentDependencies.js';
import { runAgentLoop } from '../agent/agentLoop.js';
import type { ChatMessage, ReasoningEffort } from '../model/chatTypes.js';
import type { SubagentsSettings, SuperagentSettings } from '../settings/settingsSchema.js';
import { ToolRegistry } from '../tools/ToolRegistry.js';
import { superagentSystemPrompt } from './superagentPrompt.js';
import { createSuperagentState, createSuperagentTools } from './superagentTools.js';

export interface SuperagentOptions {
  settings: SuperagentSettings;
  subagents: SubagentsSettings;
  reasoningEffort: ReasoningEffort;
  maxIterations: number;
}

export async function runSuperagentTurn(
  question: string,
  dependencies: AgentDependencies,
  options: SuperagentOptions,
  messages: ChatMessage[],
): Promise<string> {
  const { events } = dependencies;
  events.emit({ type: 'user_message', text: question });
  events.emit({
    type: 'orchestration_started',
    mode: 'superagent',
    // Шагов заранее нет: план составит модель.
    steps: [],
    settings: { ...options.settings },
  });
  const state = createSuperagentState();
  // Исполнители берут тулы из тулов сессии; у оркестратора — свои.
  const orchestrator = { ...dependencies, tools: orchestratorTools(dependencies, options, state) };
  if (messages.length === 0) {
    messages.push({
      role: 'system',
      content: superagentSystemPrompt(new Date(), options.settings.maxReworks),
    });
  }
  messages.push({ role: 'user', content: question });
  events.emit({
    type: 'prompt_assembled',
    messages: [...messages],
    toolNames: orchestrator.tools.names(),
  });
  const startedAt = performance.now();
  const finish = (status: 'done' | 'failed'): void => {
    events.emit({
      type: 'orchestration_finished',
      mode: 'superagent',
      status,
      tasks: state.runs.size,
      reworks: state.reworks,
      durationMs: Math.round(performance.now() - startedAt),
    });
  };
  try {
    const answer = await runAgentLoop(messages, orchestrator, {
      reasoningEffort: options.reasoningEffort,
      maxIterations: options.maxIterations,
      limitSetting: 'agent.maxIterations',
    });
    events.emit({ type: 'assistant_message', text: answer });
    finish('done');
    return answer;
  } catch (error) {
    finish('failed');
    throw error;
  }
}

function orchestratorTools(
  dependencies: AgentDependencies,
  options: SuperagentOptions,
  state: ReturnType<typeof createSuperagentState>,
): ToolRegistry {
  const tools = new ToolRegistry();
  for (const name of options.settings.orchestratorTools) {
    const tool = dependencies.tools.find(name);
    if (tool !== undefined) {
      tools.register(tool);
    }
  }
  for (const tool of createSuperagentTools(
    options.subagents,
    options.settings,
    state,
    () => dependencies,
  )) {
    tools.register(tool);
  }
  return tools;
}

// Субагент (этап 6c) — тот же цикл агента над своей историей: свой system prompt, поручение
// вместо вопроса, свои тулы. Модель, политика разрешений, бюджет prompt — общие с главным.
// Главному агенту возвращается только отчёт; всё остальное — в трейсе, с agentId субагента.
// Идея — как у субагентов Claude Code (Anthropic): https://code.claude.com/docs/en/sub-agents

import type { AgentDependencies } from '../agent/agentDependencies.js';
import { runAgentLoop } from '../agent/agentLoop.js';
import type { ChatMessage } from '../model/chatTypes.js';
import type { SubagentSettings } from '../settings/settingsSchema.js';
import { SessionTokenomics } from '../tokenomics/SessionTokenomics.js';
import { ToolRegistry } from '../tools/ToolRegistry.js';
import { DELEGATE_TOOL_NAME } from './delegateToolName.js';
import { buildSubagentPrompt } from './subagentPrompt.js';

export interface SubagentAssignment {
  subagentId: string;
  agent: string;
  settings: SubagentSettings;
  task: string;
  parentToolCallId: string;
}

export interface SubagentOutcome {
  report: string | null;
  errorMessage: string | null;
}

export async function runSubagent(
  assignment: SubagentAssignment,
  dependencies: AgentDependencies,
): Promise<SubagentOutcome> {
  const { subagentId, agent, settings, task, parentToolCallId } = assignment;
  const tokenomics = new SessionTokenomics();
  const events = dependencies.events.forAgent(subagentId, (event) => {
    tokenomics.handleEvent(event);
  });
  const tools = pickTools(dependencies.tools, settings.tools);
  dependencies.events.emit({
    type: 'subagent_started',
    subagentId,
    agent,
    parentToolCallId,
    task,
    toolNames: tools.names(),
    maxIterations: settings.maxIterations,
    reasoningEffort: settings.reasoningEffort,
  });
  const startedAt = performance.now();
  const outcome = await runOwnLoop(assignment, { ...dependencies, events, tools });
  const summary = tokenomics.summary();
  dependencies.events.emit({
    type: 'subagent_finished',
    subagentId,
    agent,
    parentToolCallId,
    status: outcome.report === null ? 'failed' : 'done',
    report: outcome.report,
    errorMessage: outcome.errorMessage,
    durationMs: Math.round(performance.now() - startedAt),
    modelRequests: summary.modelRequests,
    usage: summary.usage,
    modelCost: summary.modelCost,
  });
  return outcome;
}

// Ошибка субагента — не ошибка сессии: главный получит её текстом вместо отчёта.
async function runOwnLoop(
  { agent, settings, task }: SubagentAssignment,
  dependencies: AgentDependencies,
): Promise<SubagentOutcome> {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: buildSubagentPrompt(new Date(), {
        agent,
        instructions: settings.instructions,
        toolNames: dependencies.tools.names(),
        mcpInstructions: dependencies.mcpServerInstructions,
      }),
    },
    { role: 'user', content: task },
  ];
  dependencies.events.emit({
    type: 'prompt_assembled',
    messages: [...messages],
    toolNames: dependencies.tools.names(),
  });
  try {
    const report = await runAgentLoop(messages, dependencies, {
      reasoningEffort: settings.reasoningEffort,
      maxIterations: settings.maxIterations,
      limitSetting: `subagents.agents.${agent}.maxIterations`,
    });
    return { report, errorMessage: null };
  } catch (error) {
    return { report: null, errorMessage: error instanceof Error ? error.message : String(error) };
  }
}

// Тулы субагента — из тулов сессии по именам из настроек. Чего в сессии нет (веб-поиск выключен,
// MCP-сервер не запустился), того нет и у субагента. delegate_task не даём никогда: глубина одна.
function pickTools(sessionTools: ToolRegistry, names: readonly string[]): ToolRegistry {
  const picked = new ToolRegistry();
  for (const name of names) {
    const tool = sessionTools.find(name);
    if (tool !== undefined && tool.name !== DELEGATE_TOOL_NAME) {
      picked.register(tool);
    }
  }
  return picked;
}

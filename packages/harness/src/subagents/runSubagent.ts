// Субагент (этап 6c) — тот же цикл агента над своей историей: свой system prompt, поручение
// вместо вопроса, свои тулы. Модель, политика разрешений, бюджет prompt — общие с главным.
// Главному агенту возвращается только отчёт; всё остальное — в трейсе, с agentId субагента.
// Идея — как у субагентов Claude Code (Anthropic): https://code.claude.com/docs/en/sub-agents

import type { AgentDependencies } from '../agent/agentDependencies.js';
import type { HarnessEvent } from '../events/harnessEvents.js';
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
  // Шаг оркестрации, если поручил код (этап 6d).
  stepId?: string;
  // Свои тулы вместо тулов из настроек субагента — их выбирает код оркестрации (этап 6d).
  toolNames?: readonly string[];
  // Видит события субагента — так код оркестрации узнаёт, что он прочитал.
  onEvent?: (event: HarnessEvent) => void;
}

export interface SubagentOutcome {
  report: string | null;
  errorMessage: string | null;
}

// Работа субагента, которую можно продолжить: его история и тулы живут после отчёта, чтобы
// оркестратор мог вернуть отчёт на доработку (этап 6d.2) — тот же субагент, та же история.
export interface SubagentRun {
  assignment: SubagentAssignment;
  messages: ChatMessage[];
  tools: ToolRegistry;
  // Сколько раз отчитывался: 1 — первый отчёт, 2 — после первой доработки.
  round: number;
}

export async function runSubagent(
  assignment: SubagentAssignment,
  dependencies: AgentDependencies,
): Promise<SubagentOutcome & { run: SubagentRun }> {
  const { subagentId, agent, settings, task, parentToolCallId, stepId } = assignment;
  const tools = pickTools(dependencies.tools, assignment.toolNames ?? settings.tools);
  const run: SubagentRun = {
    assignment,
    messages: [
      {
        role: 'system',
        content: buildSubagentPrompt(new Date(), {
          agent,
          instructions: settings.instructions,
          toolNames: tools.names(),
          mcpInstructions: dependencies.mcpServerInstructions,
        }),
      },
      { role: 'user', content: task },
    ],
    tools,
    round: 1,
  };
  dependencies.events.emit({
    type: 'subagent_started',
    subagentId,
    agent,
    parentToolCallId,
    ...(stepId === undefined ? {} : { stepId }),
    task,
    toolNames: tools.names(),
    maxIterations: settings.maxIterations,
    reasoningEffort: settings.reasoningEffort,
  });
  const outcome = await runRound(run, dependencies, true);
  return { ...outcome, run };
}

// Доработка (этап 6d.2): замечание оркестратора — новым сообщением в историю того же субагента.
// Он видит своё прошлое поручение, прочитанное и отчёт — и дорабатывает, а не начинает заново.
export async function resumeSubagent(
  run: SubagentRun,
  feedback: string,
  dependencies: AgentDependencies,
): Promise<SubagentOutcome> {
  run.round += 1;
  const { subagentId, agent } = run.assignment;
  run.messages.push({ role: 'user', content: feedback });
  dependencies.events.emit({
    type: 'subagent_resumed',
    subagentId,
    agent,
    feedback,
    round: run.round,
  });
  return runRound(run, dependencies, false);
}

// Один заход субагента: свой цикл, своя токеномика, отчёт событием subagent_finished.
async function runRound(
  run: SubagentRun,
  dependencies: AgentDependencies,
  first: boolean,
): Promise<SubagentOutcome> {
  const { assignment } = run;
  const tokenomics = new SessionTokenomics();
  const events = dependencies.events.forAgent(assignment.subagentId, (event) => {
    tokenomics.handleEvent(event);
    assignment.onEvent?.(event);
  });
  if (first) {
    events.emit({
      type: 'prompt_assembled',
      messages: [...run.messages],
      toolNames: run.tools.names(),
    });
  }
  const startedAt = performance.now();
  const outcome = await runOwnLoop(run, { ...dependencies, events, tools: run.tools });
  const summary = tokenomics.summary();
  dependencies.events.emit({
    type: 'subagent_finished',
    subagentId: assignment.subagentId,
    agent: assignment.agent,
    parentToolCallId: assignment.parentToolCallId,
    ...(first ? {} : { round: run.round }),
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
  run: SubagentRun,
  dependencies: AgentDependencies,
): Promise<SubagentOutcome> {
  const { agent, settings } = run.assignment;
  try {
    const report = await runAgentLoop(run.messages, dependencies, {
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

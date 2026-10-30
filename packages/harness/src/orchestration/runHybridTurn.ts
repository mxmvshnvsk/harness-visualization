// Гибрид (этап 6d.3): каркас «план → выполнение → проверка → ответ» задаёт код, внутри шагов
// решает модель-оркестратор. Код гарантирует то, что суперагент мог пропустить или раздуть:
// число задач и поручений ограничено, приёмка каждого отчёта обязательна, а в шаг «ответ» код
// сам передаёт все отчёты — оркестратору не нужно помнить их в своём контексте.

import type { AgentDependencies } from '../agent/agentDependencies.js';
import { runAgentLoop } from '../agent/agentLoop.js';
import { requestModel } from '../agent/requestModel.js';
import type { OrchestrationStep } from '../events/harnessEvents.js';
import type { ChatMessage, ReasoningEffort } from '../model/chatTypes.js';
import type {
  HybridSettings,
  SubagentsSettings,
  SuperagentSettings,
} from '../settings/settingsSchema.js';
import { ToolRegistry } from '../tools/ToolRegistry.js';
import type { Tool } from '../tools/toolTypes.js';
import {
  executeInstruction,
  hybridAnswerPrompt,
  hybridSystemPrompt,
  planInstruction,
  reviewInstruction,
  type HybridReport,
} from './hybridPrompts.js';
import { runStep, type StepOutcome } from './orchestrationStep.js';
import { answerSystemPrompt } from './pipelinePrompts.js';
import {
  createSuperagentState,
  createSuperagentTools,
  lastReport,
  PLAN_TOOL_NAME,
  REVIEW_TOOL_NAME,
  type SuperagentState,
} from './superagentTools.js';
import { DELEGATE_TOOL_NAME } from '../subagents/delegateToolName.js';
import { orchestratorDependencies } from '../agent/roleModelProviders.js';

export interface HybridOptions {
  settings: HybridSettings;
  superagent: SuperagentSettings;
  subagents: SubagentsSettings;
  reasoningEffort: ReasoningEffort;
}

export const HYBRID_STEPS: OrchestrationStep[] = [
  { stepId: 'plan', title: 'Модель: план — код ограничивает число задач', kind: 'model' },
  {
    stepId: 'execute',
    title: 'Модель поручает задачи — код ограничивает число поручений',
    kind: 'agents',
  },
  { stepId: 'review', title: 'Обязательная приёмка каждого отчёта', kind: 'model' },
  {
    stepId: 'answer',
    title: 'Модель: ответ по отчётам, которые передал код, без тулов',
    kind: 'model',
  },
];

// Сколько шагов цикла у оркестратора на каждый шаг каркаса.
const PLAN_ITERATIONS = 4;
const EXECUTE_ITERATIONS = 3;
const REVIEW_ITERATIONS = 4;
// Сколько раз код напоминает о непринятых отчётах, прежде чем перейти к ответу.
const REVIEW_ROUNDS = 2;

interface HybridContext {
  dependencies: AgentDependencies;
  options: HybridOptions;
  state: SuperagentState;
  tools: Tool[];
  messages: ChatMessage[];
}

export async function runHybridTurn(
  question: string,
  dependencies: AgentDependencies,
  options: HybridOptions,
): Promise<string> {
  const { events } = dependencies;
  events.emit({ type: 'user_message', text: question });
  events.emit({
    type: 'orchestration_started',
    mode: 'hybrid',
    steps: HYBRID_STEPS,
    settings: { ...options.settings },
  });
  const state = createSuperagentState(options.settings.maxTasks, 'plan');
  const context: HybridContext = {
    dependencies: orchestratorDependencies(dependencies),
    options,
    state,
    tools: createSuperagentTools(options.subagents, options.superagent, state, () => dependencies),
    messages: [
      { role: 'system', content: hybridSystemPrompt(new Date()) },
      { role: 'user', content: question },
    ],
  };
  const startedAt = performance.now();
  try {
    await runStep(dependencies, stepOf('plan'), () => plan(context));
    await runStep(dependencies, stepOf('execute'), () => execute(context));
    await runStep(dependencies, stepOf('review'), () => review(context));
    const answer = await runStep(dependencies, stepOf('answer'), () =>
      answerByReports(question, context),
    );
    events.emit({ type: 'assistant_message', text: answer });
    finish(dependencies, state, 'done', startedAt);
    return answer;
  } catch (error) {
    finish(dependencies, state, 'failed', startedAt);
    throw error;
  }
}

function stepOf(stepId: string): OrchestrationStep {
  return (
    HYBRID_STEPS.find((item) => item.stepId === stepId) ?? { stepId, title: stepId, kind: 'code' }
  );
}

// Шаг каркаса глазами оркестратора: указание харнесса и цикл только с тулами этого шага.
async function orchestratorStep(
  context: HybridContext,
  instruction: string,
  toolNames: readonly string[],
  maxIterations: number,
): Promise<void> {
  const { dependencies } = context;
  const tools = new ToolRegistry();
  for (const name of toolNames) {
    const tool = context.tools.find((item) => item.name === name) ?? dependencies.tools.find(name);
    if (tool !== undefined) {
      tools.register(tool);
    }
  }
  context.messages.push({ role: 'user', content: instruction });
  dependencies.events.emit({
    type: 'prompt_assembled',
    messages: [...context.messages],
    toolNames: tools.names(),
  });
  await runAgentLoop(
    context.messages,
    { ...dependencies, tools },
    {
      reasoningEffort: context.options.reasoningEffort,
      maxIterations,
      limitSetting: 'шаг каркаса гибрида',
    },
  );
}

async function plan(context: HybridContext): Promise<StepOutcome<null>> {
  await orchestratorStep(
    context,
    planInstruction(context.options.settings.maxTasks),
    ['kedr__list_documents', PLAN_TOOL_NAME],
    PLAN_ITERATIONS,
  );
  const tasks = [...context.state.plan.values()];
  if (tasks.length === 0) {
    throw new Error('Оркестратор не составил план: без плана каркас дальше не идёт');
  }
  return {
    value: null,
    status: 'done',
    summary: `задач ${String(tasks.length)}: ${tasks.map((task) => task.taskId).join(', ')}`,
  };
}

async function execute(context: HybridContext): Promise<StepOutcome<null>> {
  await orchestratorStep(context, executeInstruction(), [DELEGATE_TOOL_NAME], EXECUTE_ITERATIONS);
  const delegated = new Set([...context.state.runs.values()].map((entry) => entry.taskId));
  const skipped = [...context.state.plan.values()].filter((task) => !delegated.has(task.taskId));
  const reports = [...context.state.runs.values()].filter(
    (entry) => lastReport(entry.run) !== null,
  );
  return {
    value: null,
    status: skipped.length > 0 || reports.length < context.state.runs.size ? 'warning' : 'done',
    summary: [
      `поручений ${String(context.state.runs.size)}, отчётов ${String(reports.length)}`,
      ...(skipped.length === 0
        ? []
        : [`не поручены: ${skipped.map((task) => task.taskId).join(', ')}`]),
    ].join('; '),
  };
}

// Приёмка обязательна: не принятые отчёты код называет снова, до REVIEW_ROUNDS раз.
async function review(context: HybridContext): Promise<StepOutcome<null>> {
  for (let round = 1; round <= REVIEW_ROUNDS; round += 1) {
    const pending = pendingReview(context.state);
    if (pending.length === 0) {
      break;
    }
    await orchestratorStep(
      context,
      reviewInstruction(pending),
      [REVIEW_TOOL_NAME],
      REVIEW_ITERATIONS,
    );
  }
  const pending = pendingReview(context.state);
  return {
    value: null,
    status: pending.length > 0 ? 'warning' : 'done',
    summary: [
      `принято ${String(context.state.accepted.size)} из ${String(context.state.runs.size)}, доработок ${String(context.state.reworks)}`,
      ...(pending.length === 0 ? [] : [`не приняты: ${pending.join(', ')}`]),
    ].join('; '),
  };
}

function pendingReview(state: SuperagentState): string[] {
  return [...state.runs.keys()].filter((subagentId) => !state.accepted.has(subagentId));
}

// Ответ — один запрос без тулов: отчёты передаёт код, свежими, а не из памяти оркестратора.
async function answerByReports(
  question: string,
  context: HybridContext,
): Promise<StepOutcome<string>> {
  const reports: HybridReport[] = [...context.state.runs.entries()].map(([subagentId, entry]) => ({
    subagentId,
    task: entry.run.assignment.task,
    report: lastReport(entry.run),
    accepted: context.state.accepted.has(subagentId),
  }));
  const messages: ChatMessage[] = [
    { role: 'system', content: answerSystemPrompt(new Date()) },
    { role: 'user', content: hybridAnswerPrompt(question, reports) },
  ];
  context.dependencies.events.emit({
    type: 'prompt_assembled',
    messages: [...messages],
    toolNames: [],
  });
  const { reply } = await requestModel(
    { messages, tools: [], reasoningEffort: context.options.reasoningEffort },
    context.dependencies,
    { purpose: 'agentStep', iteration: 1 },
  );
  const answer = reply.text ?? '';
  return {
    value: answer,
    status: answer === '' ? 'failed' : 'done',
    summary: `ответ ${String(answer.length)} симв.`,
  };
}

function finish(
  dependencies: AgentDependencies,
  state: SuperagentState,
  status: 'done' | 'failed',
  startedAt: number,
): void {
  dependencies.events.emit({
    type: 'orchestration_finished',
    mode: 'hybrid',
    status,
    tasks: state.runs.size,
    reworks: state.reworks,
    durationMs: Math.round(performance.now() - startedAt),
  });
}

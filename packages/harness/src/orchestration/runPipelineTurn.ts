// Пайплайн — детерминированная оркестрация (этап 6d): шаги, их порядок и параллельность задаёт
// этот код, в каждом прогоне схема одна и та же. Модель работает внутри шагов — исследователи
// читают документы, модель пишет ответ, — но пропустить или добавить шаг не может.
// Детерминирован путь, а не ответ. Термин и подход — workflow из статьи Anthropic
// «Building effective agents»: https://www.anthropic.com/engineering/building-effective-agents
//
//   1. код: найти документы по вопросу (тот же поиск, что у харнесса в режиме auto);
//   2. исследователи: по документу на каждого, одновременно;
//   3. код: собрать конспекты;
//   4. модель: один запрос без тулов — ответ по конспектам;
//   5. код: проверить ссылки ответа — названы ли документы, которые изучали.

import type { AgentDependencies } from '../agent/agentDependencies.js';
import { requestModel } from '../agent/requestModel.js';
import { retrieveContext } from '../agent/retrieveContext.js';
import type { HarnessEvent, OrchestrationStep, PlannedTask } from '../events/harnessEvents.js';
import type { ChatMessage, ReasoningEffort } from '../model/chatTypes.js';
import type { PipelineSettings, SubagentSettings } from '../settings/settingsSchema.js';
import { runSubagent } from '../subagents/runSubagent.js';
import { runStep, type StepOutcome } from './orchestrationStep.js';
import {
  answerSystemPrompt,
  answerUserPrompt,
  researchTask,
  type ResearchNote,
} from './pipelinePrompts.js';

export interface PipelineOptions {
  settings: PipelineSettings;
  researcher: SubagentSettings;
  searchTool: string;
  reasoningEffort: ReasoningEffort;
}

export const PIPELINE_STEPS: OrchestrationStep[] = [
  { stepId: 'find', title: 'Код: найти документы по вопросу', kind: 'code' },
  {
    stepId: 'research',
    title: 'Исследователи: по документу на каждого, одновременно',
    kind: 'agents',
  },
  { stepId: 'collect', title: 'Код: собрать конспекты', kind: 'code' },
  { stepId: 'answer', title: 'Модель: ответ по конспектам, без тулов', kind: 'model' },
  { stepId: 'verify', title: 'Код: проверить ссылки ответа', kind: 'code' },
];

// Id документа базы знаний в выдаче поиска: «regulations/vacation — Регламент…».
const RESULT_ID = /^([\w-]+\/[\w-]+) — /gmu;
// Прочитанный документ: результат read_document начинается с «id: regulations/vacation».
const DOCUMENT_HEADER = /^id: ([\w-]+\/[\w-]+)/u;
// Id документа в ответе модели — в обратных кавычках.
const CITED_ID = /`([\w-]+\/[\w-]+)`/gu;

export async function runPipelineTurn(
  question: string,
  dependencies: AgentDependencies,
  options: PipelineOptions,
): Promise<string> {
  const { events } = dependencies;
  events.emit({ type: 'user_message', text: question });
  events.emit({
    type: 'orchestration_started',
    mode: 'pipeline',
    steps: PIPELINE_STEPS,
    settings: { ...options.settings, searchTool: options.searchTool },
  });
  const startedAt = performance.now();
  let tasks = 0;
  try {
    const documents = await step(dependencies, 'find', () =>
      findDocuments(question, dependencies, options),
    );
    tasks = documents.length;
    announcePlan(dependencies, documents, options.settings.researcher);
    const { notes, read } = await step(dependencies, 'research', () =>
      research(question, documents, dependencies, options),
    );
    const prompt = await step(dependencies, 'collect', () =>
      Promise.resolve(collect(question, notes)),
    );
    const answer = await step(dependencies, 'answer', () =>
      answerByNotes(prompt, dependencies, options),
    );
    await step(dependencies, 'verify', () =>
      Promise.resolve(verifyCitations(answer, documents, read)),
    );
    events.emit({ type: 'assistant_message', text: answer });
    finish(dependencies, 'done', tasks, startedAt);
    return answer;
  } catch (error) {
    finish(dependencies, 'failed', tasks, startedAt);
    throw error;
  }
}

// Шаг пайплайна — из списка PIPELINE_STEPS: его порядок и состав задал код.
function step<Value>(
  dependencies: AgentDependencies,
  stepId: string,
  run: () => Promise<StepOutcome<Value>>,
): Promise<Value> {
  const known = PIPELINE_STEPS.find((item) => item.stepId === stepId) ?? {
    stepId,
    title: stepId,
    kind: 'code' as const,
  };
  return runStep(dependencies, known, run);
}

// Шаг 1. Поиск по словам пользователя — слабое место пайплайна: что поиск не нашёл, того
// исследователи не прочитают (урок 3 плана: подмешанное якорит).
async function findDocuments(
  question: string,
  dependencies: AgentDependencies,
  options: PipelineOptions,
): Promise<StepOutcome<string[]>> {
  const found = await retrieveContext(
    { userQuestion: question, query: question, queryAuthor: 'user' },
    { toolName: options.searchTool, limit: options.settings.maxDocuments * 3, rewriteQuery: false },
    dependencies,
  );
  const ids = [...new Set([...(found ?? '').matchAll(RESULT_ID)].map((match) => match[1] ?? ''))]
    .filter((id) => id !== '')
    .slice(0, options.settings.maxDocuments);
  return {
    value: ids,
    status: ids.length === 0 ? 'warning' : 'done',
    summary: ids.length === 0 ? 'документов не нашлось' : ids.join(', '),
  };
}

function announcePlan(dependencies: AgentDependencies, documents: string[], agent: string): void {
  const tasks: PlannedTask[] = documents.map((id, index) => ({
    taskId: `task-${String(index + 1)}`,
    title: `Изучить ${id}`,
    agent,
  }));
  dependencies.events.emit({ type: 'plan_created', author: 'code', stepId: 'find', tasks });
}

// Шаг 2. Параллельность решил код: документы независимы, исследователи друг друга не ждут.
async function research(
  question: string,
  documents: string[],
  dependencies: AgentDependencies,
  options: PipelineOptions,
): Promise<StepOutcome<Research>> {
  const agent = options.settings.researcher;
  const read = new Set<string>();
  const notes = await Promise.all(
    documents.map(async (documentId, index): Promise<ResearchNote> => {
      const subagentId = `${agent}-${String(index + 1)}`;
      const { report, errorMessage } = await runSubagent(
        {
          subagentId,
          agent,
          settings: options.researcher,
          task: researchTask(question, documentId),
          parentToolCallId: '',
          stepId: 'research',
          toolNames: options.settings.researcherTools,
          onEvent: (event) => {
            noteReadDocument(event, read);
          },
        },
        dependencies,
      );
      return { documentId, subagentId, report, errorMessage };
    }),
  );
  const failed = notes.filter((note) => note.report === null).length;
  return {
    value: { notes, read: [...read] },
    status: failed > 0 ? 'warning' : 'done',
    summary:
      documents.length === 0
        ? 'поручать нечего'
        : `конспектов ${String(notes.length - failed)} из ${String(notes.length)}`,
  };
}

interface Research {
  notes: ResearchNote[];
  // Какие документы исследователи прочитали на самом деле — не только порученные.
  read: string[];
}

// Исследователь прочитал документ: успешный результат тула чтения начинается с его id.
function noteReadDocument(event: HarnessEvent, read: Set<string>): void {
  if (event.type !== 'tool_result' || event.status !== 'success') {
    return;
  }
  const id = DOCUMENT_HEADER.exec(event.content)?.[1];
  if (id !== undefined) {
    read.add(id);
  }
}

// Шаг 3. Собрать конспекты — работа кода: что попадёт к модели, решает он.
function collect(question: string, notes: ResearchNote[]): StepOutcome<string> {
  const prompt = answerUserPrompt(question, notes);
  return {
    value: prompt,
    status: 'done',
    summary: `${String(notes.length)} конспектов, ${String(prompt.length)} симв.`,
  };
}

// Шаг 4. Один запрос к модели без тулов: искать ей уже нечем и незачем.
async function answerByNotes(
  prompt: string,
  dependencies: AgentDependencies,
  options: PipelineOptions,
): Promise<StepOutcome<string>> {
  const messages: ChatMessage[] = [
    { role: 'system', content: answerSystemPrompt(new Date()) },
    { role: 'user', content: prompt },
  ];
  dependencies.events.emit({ type: 'prompt_assembled', messages: [...messages], toolNames: [] });
  const { reply } = await requestModel(
    { messages, tools: [], reasoningEffort: options.reasoningEffort },
    dependencies,
    { purpose: 'agentStep', iteration: 1 },
  );
  const answer = reply.text ?? '';
  return {
    value: answer,
    status: answer === '' ? 'failed' : 'done',
    summary: `ответ ${String(answer.length)} симв.`,
  };
}

// Шаг 5. Проверка кодом: названы ли изученные документы и нет ли ссылок на то, чего никто не читал.
// Сверяет с прочитанным на деле, а не с планом: исследователь мог прочитать и другой документ.
// Честна ровно настолько, насколько предсказуем формат: id без кавычек она не увидит (урок 11).
function verifyCitations(answer: string, planned: string[], read: string[]): StepOutcome<null> {
  const cited = [...new Set([...answer.matchAll(CITED_ID)].map((match) => match[1] ?? ''))];
  const offPlan = cited.filter((id) => !planned.includes(id) && read.includes(id));
  const unread = cited.filter((id) => !planned.includes(id) && !read.includes(id));
  const silent = planned.filter((id) => !cited.includes(id));
  const parts = [
    `названы: ${cited.length === 0 ? 'ни одного' : cited.join(', ')}`,
    ...(offPlan.length === 0
      ? []
      : [`не из плана, но прочитаны исследователями: ${offPlan.join(', ')}`]),
    ...(unread.length === 0 ? [] : [`нигде не читались: ${unread.join(', ')}`]),
    ...(silent.length === 0 ? [] : [`изучены, но не названы: ${silent.join(', ')}`]),
  ];
  return {
    value: null,
    status: unread.length > 0 || cited.length === 0 ? 'warning' : 'done',
    summary: parts.join('; '),
  };
}

function finish(
  dependencies: AgentDependencies,
  status: 'done' | 'failed',
  tasks: number,
  startedAt: number,
): void {
  dependencies.events.emit({
    type: 'orchestration_finished',
    mode: 'pipeline',
    status,
    tasks,
    reworks: 0,
    durationMs: Math.round(performance.now() - startedAt),
  });
}

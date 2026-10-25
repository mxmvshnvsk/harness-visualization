// Цикл агента — сердце харнесса:
//   1. отправить модели контекст и описания тулов;
//   2. если модель просит тулы — выполнить их и добавить результаты в контекст;
//   3. повторять, пока модель не ответит текстом (или не кончится лимит шагов).
// Модель сама ничего не выполняет: она только просит, а делает всё харнесс.
//
// История диалога (conversation) живёт дольше хода: следующий вопрос той же сессии
// дописывается в неё, и модель снова получает всё с начала — сама она ничего не помнит.

import type {
  AssistantMessage,
  ChatMessage,
  ModelReply,
  ReasoningEffort,
  ToolCall,
} from '../model/chatTypes.js';
import type { AgentDependencies } from './agentDependencies.js';
import { clearOldToolResults } from '../context/clearOldToolResults.js';
import { compactHistory } from '../context/compactHistory.js';
import { estimatePromptBudget } from '../context/promptBudget.js';
import { executeToolCall } from './executeToolCall.js';
import { requestModel } from './requestModel.js';
import {
  combineWithRetrievedContext,
  retrieveContext,
  type RetrievalOptions,
  type RetrievalQuery,
} from './retrieveContext.js';
import { rewriteSearchQuery } from './rewriteSearchQuery.js';
import { describeMemory } from '../memory/memoryPrompt.js';
import { describeSkills, parseSkillCommand, withSkillInstructions } from '../skills/skillPrompt.js';
import { buildSystemPrompt } from './systemPrompt.js';

export interface TurnOptions {
  reasoningEffort: ReasoningEffort;
  maxIterations: number;
  // null — модель ищет в базе знаний сама; иначе харнесс подмешивает найденное до запроса.
  retrieval: RetrievalOptions | null;
}

export async function runAgentTurn(
  userText: string,
  dependencies: AgentDependencies,
  options: TurnOptions,
  // История диалога: пустая — первый ход; ход дописывает в неё вопрос, ответы и результаты тулов.
  messages: ChatMessage[],
): Promise<string> {
  const { events, tools } = dependencies;
  events.emit({ type: 'user_message', text: userText });

  const userContent = await prepareWithSkill(userText, dependencies, options.retrieval);
  if (messages.length === 0) {
    messages.push(systemMessage(dependencies));
  }
  messages.push({ role: 'user', content: userContent });
  events.emit({ type: 'prompt_assembled', messages: [...messages], toolNames: tools.names() });

  for (let iteration = 1; iteration <= options.maxIterations; iteration += 1) {
    await freeContextSpace(messages, dependencies, options.reasoningEffort);
    const { reply } = await requestModel(
      { messages, tools: tools.definitions(), reasoningEffort: options.reasoningEffort },
      dependencies,
      { purpose: 'agentStep', iteration },
    );
    messages.push(toAssistantMessage(reply));

    if (reply.toolCalls.length === 0) {
      const answer = reply.text ?? '';
      events.emit({ type: 'assistant_message', text: answer });
      return answer;
    }
    await runRequestedTools(reply.toolCalls, messages, dependencies);
  }

  throw new Error(
    `Агент не закончил работу за ${options.maxIterations} шагов. ` +
      'Лимит задаётся в harness.config.json: agent.maxIterations.',
  );
}

// Текст сообщения пользователя для модели: сам вопрос или вопрос вместе с найденным харнессом.
async function prepareUserContent(
  userText: string,
  dependencies: AgentDependencies,
  retrieval: RetrievalOptions | null,
): Promise<string> {
  if (retrieval === null) {
    return userText;
  }
  const search = await prepareRetrievalQuery(userText, dependencies, retrieval);
  const retrievedText = await retrieveContext(search, retrieval, dependencies);
  if (retrievedText === null) {
    return userText;
  }
  return combineWithRetrievedContext(retrievedText, search, retrieval.toolName);
}

// Кто формулирует запрос для поиска харнесса: сам пользователь (auto) или модель (rewrite).
async function prepareRetrievalQuery(
  userText: string,
  dependencies: AgentDependencies,
  retrieval: RetrievalOptions,
): Promise<RetrievalQuery> {
  if (!retrieval.rewriteQuery) {
    return { userQuestion: userText, query: userText, queryAuthor: 'user' };
  }
  const query = await rewriteSearchQuery(userText, dependencies);
  return { userQuestion: userText, query, queryAuthor: 'model' };
}

// Модель не помнит прошлых запросов: всё, что она должна знать, харнесс кладёт в начало истории.
function systemMessage(dependencies: AgentDependencies): ChatMessage {
  return {
    role: 'system',
    content: buildSystemPrompt(new Date(), {
      mcpInstructions: dependencies.mcpServerInstructions,
      skills: describeSkills(dependencies.skills),
      memory: describeMemory(dependencies.memory.memoAtStart),
    }),
  };
}

// «/имя скилла» в начале вопроса — пользователь сам загружает скилл: инструкция встаёт перед
// вопросом. Поиск харнесса (retrieval) ищет по самому вопросу, без команды и инструкции.
async function prepareWithSkill(
  userText: string,
  dependencies: AgentDependencies,
  retrieval: RetrievalOptions | null,
): Promise<string> {
  const command = parseSkillCommand(userText, dependencies.skills);
  if (command === null) {
    return prepareUserContent(userText, dependencies, retrieval);
  }
  dependencies.skills.load(command.skill, 'user');
  const question = command.rest || 'Выполни задачу скилла.';
  return withSkillInstructions(
    command.skill,
    await prepareUserContent(question, dependencies, retrieval),
  );
}

// Перед запросом к модели: prompt дорос до порога — сначала убрать старые результаты тулов
// (этап 6.4), не хватило — сжать прошлые ходы в сводку (этап 6.5).
async function freeContextSpace(
  messages: ChatMessage[],
  dependencies: AgentDependencies,
  reasoningEffort: ReasoningEffort,
): Promise<void> {
  const { budget, provider, tools, events } = dependencies;
  // Оценка — по телу запроса, как его соберёт провайдер: той же формулой, что бюджет.
  const estimateTotal = (): number =>
    estimatePromptBudget(
      provider.prepareRequest({ messages, tools: tools.definitions(), reasoningEffort }).body,
      budget,
    ).estimate.total;
  const thresholdTokens = Math.round((budget.limitTokens * budget.thresholdPercent) / 100);
  const targetTokens = Math.round((budget.limitTokens * budget.clearTargetPercent) / 100);
  const clearing = clearOldToolResults(messages, estimateTotal, {
    thresholdTokens,
    targetTokens,
    charsPerToken: budget.charsPerToken,
  });
  if (clearing !== null) {
    events.emit({
      type: 'tool_results_cleared',
      ...clearing,
      thresholdTokens,
      targetTokens,
      preset: budget.preset,
    });
  }
  const beforeTokens = estimateTotal();
  if (beforeTokens > thresholdTokens) {
    await compact(messages, dependencies, { beforeTokens, thresholdTokens, estimateTotal });
  }
}

interface CompactionContext {
  beforeTokens: number;
  thresholdTokens: number;
  estimateTotal: () => number;
}

// Сводка — служебный запрос; не удался — продолжаем без неё: ошибка уже в model_error.
async function compact(
  messages: ChatMessage[],
  dependencies: AgentDependencies,
  { beforeTokens, thresholdTokens, estimateTotal }: CompactionContext,
): Promise<void> {
  const { events, budget, compactionProvider } = dependencies;
  try {
    const compaction = await compactHistory(messages, {
      ...dependencies,
      provider: compactionProvider,
    });
    if (compaction !== null) {
      events.emit({
        type: 'history_compacted',
        ...compaction,
        beforeTokens,
        afterTokens: estimateTotal(),
        thresholdTokens,
        preset: budget.preset,
      });
    }
  } catch {
    // Пусть запрос уйдёт как есть: бюджет — учебный лимит харнесса, а не окно модели.
  }
}

// Ответ модели становится частью истории — вместе с рассуждениями и просьбами вызвать тулы.
function toAssistantMessage(reply: ModelReply): AssistantMessage {
  return {
    role: 'assistant',
    content: reply.text,
    reasoningContent: reply.reasoningText,
    toolCalls: reply.toolCalls,
  };
}

// Тулы выполняются по очереди, в том порядке, в каком их попросила модель.
async function runRequestedTools(
  toolCalls: ToolCall[],
  messages: ChatMessage[],
  dependencies: AgentDependencies,
): Promise<void> {
  for (const toolCall of toolCalls) {
    const resultMessage = await executeToolCall(toolCall, dependencies);
    messages.push(resultMessage);
  }
}

// Цикл агента — сердце харнесса:
//   1. отправить модели контекст и описания тулов;
//   2. если модель просит тулы — выполнить их и добавить результаты в контекст;
//   3. повторять, пока модель не ответит текстом (или не кончится лимит шагов).
// Модель сама ничего не выполняет: она только просит, а делает всё харнесс.
//
// История диалога (conversation) живёт дольше хода: следующий вопрос той же сессии
// дописывается в неё, и модель снова получает всё с начала — сама она ничего не помнит.

import type { ChatMessage, ReasoningEffort } from '../model/chatTypes.js';
import type { AgentDependencies } from './agentDependencies.js';
import { runAgentLoop } from './agentLoop.js';
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

  const answer = await runAgentLoop(messages, dependencies, {
    reasoningEffort: options.reasoningEffort,
    maxIterations: options.maxIterations,
    limitSetting: 'agent.maxIterations',
  });
  events.emit({ type: 'assistant_message', text: answer });
  return answer;
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

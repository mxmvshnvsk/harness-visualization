// Цикл агента — сердце харнесса:
//   1. отправить модели контекст и описания тулов;
//   2. если модель просит тулы — выполнить их и добавить результаты в контекст;
//   3. повторять, пока модель не ответит текстом (или не кончится лимит шагов).
// Модель сама ничего не выполняет: она только просит, а делает всё харнесс.

import type {
  AssistantMessage,
  ChatMessage,
  ModelReply,
  ReasoningEffort,
  ToolCall,
} from '../model/chatTypes.js';
import type { AgentDependencies } from './agentDependencies.js';
import { executeToolCall } from './executeToolCall.js';
import { requestModel } from './requestModel.js';
import { buildSystemPrompt, type McpServerInstructions } from './systemPrompt.js';

export interface TurnOptions {
  reasoningEffort: ReasoningEffort;
  maxIterations: number;
}

export async function runAgentTurn(
  userText: string,
  dependencies: AgentDependencies,
  options: TurnOptions,
): Promise<string> {
  const { events, tools } = dependencies;
  events.emit({ type: 'user_message', text: userText });

  const messages = assembleInitialContext(userText, dependencies.mcpServerInstructions);
  events.emit({ type: 'prompt_assembled', messages: [...messages], toolNames: tools.names() });

  for (let iteration = 1; iteration <= options.maxIterations; iteration += 1) {
    const reply = await requestModel(
      { messages, tools: tools.definitions(), reasoningEffort: options.reasoningEffort },
      dependencies,
      iteration,
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

// Модель не помнит прошлых запросов: всё, что она должна знать, харнесс кладёт сюда.
function assembleInitialContext(
  userText: string,
  mcpInstructions: McpServerInstructions[],
): ChatMessage[] {
  return [
    { role: 'system', content: buildSystemPrompt(new Date(), mcpInstructions) },
    { role: 'user', content: userText },
  ];
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

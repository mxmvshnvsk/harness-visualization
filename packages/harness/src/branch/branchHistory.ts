import type { AssistantMessage, ChatMessage } from '../model/chatTypes.js';

// Подписи и скрытые рассуждения принадлежат конкретной модели и провайдеру.
export function adaptBranchHistory(messages: ChatMessage[], switched: boolean): ChatMessage[] {
  if (!switched) {
    return messages;
  }
  return messages.map((message) => {
    if (message.role !== 'assistant') {
      return message;
    }
    return {
      role: 'assistant',
      content: message.content,
      toolCalls: message.toolCalls,
      reasoningContent: null,
    };
  });
}

export function validateBranchHistory(
  messages: ChatMessage[],
  thinking: boolean,
  style: string,
): void {
  validateToolResults(messages);
  if (!thinking) {
    return;
  }
  const lastUserIndex = messages.findLastIndex((message) => message.role === 'user');
  const currentTurn = messages.slice(lastUserIndex + 1);
  if (currentTurn.some((message) => lacksToolReasoning(message, style))) {
    throw new Error(
      'Для продолжения thinking с инструментами нет совместимых рассуждений. Выберите шаг до вызова инструментов или effort off.',
    );
  }
}

function validateToolResults(messages: ChatMessage[]): void {
  const pendingToolCalls = new Set<string>();
  for (const message of messages) {
    if (message.role === 'assistant') {
      rememberToolCalls(message, pendingToolCalls);
    }
    if (message.role === 'tool' && !pendingToolCalls.delete(message.toolCallId)) {
      throw new Error('В истории результат без вызова инструмента. Выберите более ранний шаг.');
    }
  }
  if (pendingToolCalls.size > 0) {
    throw new Error('В истории не завершены вызовы инструментов. Выберите более ранний шаг.');
  }
}

function rememberToolCalls(message: AssistantMessage, pendingToolCalls: Set<string>): void {
  for (const toolCall of message.toolCalls) {
    pendingToolCalls.add(toolCall.id);
  }
}

function lacksToolReasoning(message: ChatMessage, style: string): boolean {
  if (message.role !== 'assistant' || message.toolCalls.length === 0) {
    return false;
  }
  if (style === 'deepseek') {
    return !message.reasoningContent;
  }
  if (style === 'openrouter') {
    return !message.reasoningDetails?.length;
  }
  return false;
}

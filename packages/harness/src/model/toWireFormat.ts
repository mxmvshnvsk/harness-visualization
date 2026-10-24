// Переводит наши сообщения и описания тулов в формат OpenAI-совместимого API.

import type { ReasoningStyle } from '../settings/settingsSchema.js';
import type { AssistantMessage, ChatMessage, ToolCall, ToolDefinition } from './chatTypes.js';

type WireObject = Record<string, unknown>;

export function toWireMessages(
  messages: ChatMessage[],
  reasoningStyle: ReasoningStyle,
): WireObject[] {
  return messages.map((message) => toWireMessage(message, reasoningStyle));
}

export function toWireTools(tools: ToolDefinition[]): WireObject[] {
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

function toWireMessage(message: ChatMessage, reasoningStyle: ReasoningStyle): WireObject {
  switch (message.role) {
    case 'system':
    case 'user':
      return { role: message.role, content: message.content };
    case 'assistant':
      return toWireAssistantMessage(message, reasoningStyle);
    case 'tool':
      return { role: 'tool', tool_call_id: message.toolCallId, content: message.content };
  }
}

function toWireAssistantMessage(
  message: AssistantMessage,
  reasoningStyle: ReasoningStyle,
): WireObject {
  const wireMessage: WireObject = { role: 'assistant', content: message.content };
  if (message.toolCalls.length > 0) {
    wireMessage['tool_calls'] = message.toolCalls.map(toWireToolCall);
  }
  // DeepSeek в режиме рассуждений с тулами требует вернуть reasoning_content
  // во всех следующих запросах, иначе отвечает ошибкой 400. Другим провайдерам это поле не нужно.
  if (reasoningStyle === 'deepseek' && message.reasoningContent !== null) {
    wireMessage['reasoning_content'] = message.reasoningContent;
  }
  return wireMessage;
}

function toWireToolCall(toolCall: ToolCall): WireObject {
  return {
    id: toolCall.id,
    type: 'function',
    function: { name: toolCall.name, arguments: toolCall.argumentsText },
  };
}

// Выполняет один вызов тула, который попросила модель.
// Любая ошибка — неизвестный тул, кривой JSON, неверные аргументы, сбой тула —
// не роняет агента, а возвращается модели текстом, чтобы она могла исправиться.

import type { ToolCall, ToolResultMessage } from '../model/chatTypes.js';
import type { AgentDependencies } from './agentDependencies.js';

type ParsedArguments = { success: true; value: unknown } | { success: false; errorMessage: string };

interface ToolOutcome {
  content: string;
  isError: boolean;
}

export async function executeToolCall(
  toolCall: ToolCall,
  dependencies: AgentDependencies,
): Promise<ToolResultMessage> {
  const parsedArguments = parseArgumentsText(toolCall.argumentsText);
  dependencies.events.emit({
    type: 'tool_call',
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    argumentsText: toolCall.argumentsText,
    arguments: parsedArguments.success ? parsedArguments.value : null,
  });

  const startedAt = performance.now();
  const outcome = await runTool(toolCall.name, parsedArguments, dependencies);
  dependencies.events.emit({
    type: 'tool_result',
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    isError: outcome.isError,
    content: outcome.content,
    durationMs: Math.round(performance.now() - startedAt),
  });

  return { role: 'tool', toolCallId: toolCall.id, content: outcome.content };
}

function parseArgumentsText(argumentsText: string): ParsedArguments {
  // Тул без аргументов модель иногда вызывает с пустой строкой.
  if (argumentsText.trim() === '') {
    return { success: true, value: {} };
  }
  try {
    return { success: true, value: JSON.parse(argumentsText) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { success: false, errorMessage: `Аргументы — не корректный JSON: ${reason}` };
  }
}

async function runTool(
  toolName: string,
  parsedArguments: ParsedArguments,
  dependencies: AgentDependencies,
): Promise<ToolOutcome> {
  const tool = dependencies.tools.find(toolName);
  if (tool === undefined) {
    const availableTools = dependencies.tools.names().join(', ');
    return failure(`Тула «${toolName}» нет. Доступные тулы: ${availableTools}`);
  }
  if (!parsedArguments.success) {
    return failure(parsedArguments.errorMessage);
  }
  try {
    const content = await tool.run(parsedArguments.value, dependencies.toolContext);
    return { content, isError: false };
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error));
  }
}

function failure(message: string): ToolOutcome {
  return { content: `Ошибка: ${message}`, isError: true };
}

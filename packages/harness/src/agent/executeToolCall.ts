// Выполняет один вызов тула, который попросила модель.
// Любая ошибка — неизвестный тул, кривой JSON, неверные аргументы, сбой тула —
// не роняет агента, а возвращается модели текстом, чтобы она могла исправиться.
// Перед выполнением харнесс применяет политику разрешений: разрешить, спросить или запретить.

import type { ToolCall, ToolResultMessage } from '../model/chatTypes.js';
import type { ToolResultStatus } from '../events/harnessEvents.js';
import { evaluatePermission } from '../permissions/evaluatePermission.js';
import type { PreparedToolCall } from '../tools/toolTypes.js';
import type { AgentDependencies } from './agentDependencies.js';

type ParsedArguments = { success: true; value: unknown } | { success: false; errorMessage: string };

interface ToolOutcome {
  status: ToolResultStatus;
  content: string;
  details: Record<string, unknown> | null;
  // Сколько выполнялся сам тул — без времени, пока пользователь решал, разрешить ли.
  durationMs: number;
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

  const outcome = await runTool(toolCall, parsedArguments, dependencies);
  dependencies.events.emit({
    type: 'tool_result',
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    status: outcome.status,
    content: outcome.content,
    details: outcome.details,
    durationMs: outcome.durationMs,
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
    return {
      success: false,
      errorMessage: `Аргументы — не корректный JSON: ${describeError(error)}`,
    };
  }
}

async function runTool(
  toolCall: ToolCall,
  parsedArguments: ParsedArguments,
  dependencies: AgentDependencies,
): Promise<ToolOutcome> {
  const tool = dependencies.tools.find(toolCall.name);
  if (tool === undefined) {
    const availableTools = dependencies.tools.names().join(', ');
    return failure(`Тула «${toolCall.name}» нет. Доступные тулы: ${availableTools}`);
  }
  if (!parsedArguments.success) {
    return failure(parsedArguments.errorMessage);
  }

  let preparedCall: PreparedToolCall;
  try {
    preparedCall = tool.prepare(parsedArguments.value);
    await preparedCall.checkBeforeExecution(dependencies.toolContext);
  } catch (error) {
    return failure(describeError(error));
  }

  const evaluation = evaluatePermission(
    { toolName: tool.name, effects: tool.effects, targets: preparedCall.targets },
    dependencies.permissionPolicy,
  );
  dependencies.events.emit({
    type: 'permission_evaluated',
    toolCallId: toolCall.id,
    toolName: tool.name,
    effects: [...tool.effects],
    targets: preparedCall.targets,
    actionDescription: preparedCall.actionDescription,
    decision: evaluation.decision,
    reason: evaluation.reason,
    checks: evaluation.checks,
  });

  switch (evaluation.decision) {
    case 'deny':
      return blocked(preparedCall.actionDescription, evaluation.reason);
    case 'ask': {
      const approved = await askPermission(toolCall, preparedCall.actionDescription, dependencies);
      return approved
        ? executePreparedCall(preparedCall, dependencies)
        : denial(preparedCall.actionDescription);
    }
    case 'allow':
      return executePreparedCall(preparedCall, dependencies);
  }
}

async function askPermission(
  toolCall: ToolCall,
  actionDescription: string,
  dependencies: AgentDependencies,
): Promise<boolean> {
  dependencies.events.emit({
    type: 'permission_requested',
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    actionDescription,
  });
  const waitStartedAt = performance.now();
  const approved = await dependencies.confirmAction({ toolName: toolCall.name, actionDescription });
  dependencies.events.emit({
    type: 'permission_resolved',
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    approved,
    waitedForUserMs: Math.round(performance.now() - waitStartedAt),
  });
  return approved;
}

async function executePreparedCall(
  preparedCall: PreparedToolCall,
  dependencies: AgentDependencies,
): Promise<ToolOutcome> {
  const startedAt = performance.now();
  try {
    const output = await preparedCall.execute(dependencies.toolContext);
    return {
      status: 'success',
      content: output.content,
      details: output.details ?? null,
      durationMs: Math.round(performance.now() - startedAt),
    };
  } catch (error) {
    return failure(describeError(error), Math.round(performance.now() - startedAt));
  }
}

// Ошибки до выполнения (неизвестный тул, неверные аргументы) занимают 0 мс работы тула.
function failure(message: string, durationMs = 0): ToolOutcome {
  return { status: 'error', content: `Ошибка: ${message}`, details: null, durationMs };
}

// Политика харнесса запретила действие. Модель должна понять, что это правило,
// а не сбой, и не искать обходной путь.
function blocked(actionDescription: string, reason: string): ToolOutcome {
  return {
    status: 'blocked',
    content:
      `Действие запрещено политикой харнесса: ${actionDescription}. ${reason}. ` +
      'Не пытайся выполнить его другим способом; если оно нужно, сообщи пользователю.',
    details: null,
    durationMs: 0,
  };
}

// Модель должна понять, что это не сбой, а решение человека, и не пытаться обойти его.
function denial(actionDescription: string): ToolOutcome {
  return {
    status: 'denied',
    content:
      `Пользователь не разрешил действие: ${actionDescription}. ` +
      'Не повторяй его без нового запроса пользователя.',
    details: null,
    durationMs: 0,
  };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

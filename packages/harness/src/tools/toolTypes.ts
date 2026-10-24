// Что такое тул для харнесса.

import type { Workspace } from '../workspace/Workspace.js';

// То, к чему тулу разрешён доступ. Тул не получает ничего сверх этого.
export interface ToolContext {
  workspace: Workspace;
}

export interface ToolOutput {
  // Текст, который увидит модель.
  content: string;
  // Подробности для трейса и токеномики — модель их не видит.
  // Например, сколько кредитов стоил поиск или сколько весила страница.
  details?: Record<string, unknown>;
}

// Вызов тула после проверки аргументов, ещё не выполненный.
// Между проверкой и выполнением харнесс может спросить разрешения у пользователя.
export interface PreparedToolCall {
  // Описание действия для человека, если тул требует подтверждения, иначе null.
  confirmationText: string | null;
  // Проверяет, что действие вообще возможно, ещё до вопроса пользователю:
  // незачем спрашивать разрешение удалить файл, которого нет.
  checkBeforeConfirmation(context: ToolContext): Promise<void>;
  execute(context: ToolContext): Promise<ToolOutput>;
}

export interface Tool {
  readonly name: string;
  // Описание читает модель — по нему она решает, когда вызывать тул.
  readonly description: string;
  // JSON Schema аргументов для модели.
  readonly parametersSchema: Record<string, unknown>;
  // Проверяет аргументы. При ошибке бросает ToolError с понятным модели текстом.
  prepare(rawArguments: unknown): PreparedToolCall;
}

// Что такое тул для харнесса.

import type { Workspace } from '../workspace/Workspace.js';

// То, к чему тулу разрешён доступ. Тул не получает ничего сверх этого.
export interface ToolContext {
  workspace: Workspace;
}

export interface Tool {
  readonly name: string;
  // Описание читает модель — по нему она решает, когда вызывать тул.
  readonly description: string;
  // JSON Schema аргументов для модели.
  readonly parametersSchema: Record<string, unknown>;
  // Проверяет аргументы и выполняет тул. Возвращает текст, который увидит модель.
  run(rawArguments: unknown, context: ToolContext): Promise<string>;
}

// Что такое тул для харнесса.

import type { ActionTarget, ToolEffect } from '../permissions/permissionTypes.js';
import type { ToolCallCost } from '../tokenomics/costTypes.js';
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
  // Стоимость вызова в деньгах, если тул ходит в платный сервис. Отдельно от details,
  // чтобы токеномика складывала её, не зная устройства каждого тула.
  cost?: ToolCallCost | null;
}

// Вызов тула после проверки аргументов, ещё не выполненный.
// Между проверкой и выполнением харнесс применяет политику разрешений
// и, если нужно, спрашивает пользователя.
export interface PreparedToolCall {
  // Описание действия для человека: «Удалить файл notes/a.md».
  actionDescription: string;
  // С чем работает вызов: пути и адреса — по ним проверяются правила политики.
  targets: ActionTarget[];
  // Что делает именно этот вызов — у тула с командами (memory) это зависит от команды:
  // view читает, delete удаляет. Политика решает по ним, а не по всем классам тула.
  effects: readonly ToolEffect[];
  // Проверяет, что действие вообще возможно, ещё до решения о разрешении:
  // незачем спрашивать разрешение удалить файл, которого нет.
  checkBeforeExecution(context: ToolContext): Promise<void>;
  execute(context: ToolContext): Promise<ToolOutput>;
}

export interface Tool {
  readonly name: string;
  // Описание читает модель — по нему она решает, когда вызывать тул.
  readonly description: string;
  // JSON Schema аргументов для модели.
  readonly parametersSchema: Record<string, unknown>;
  // Что тул делает: читает, пишет, удаляет, ходит в сеть — все классы, какие могут быть у его
  // вызовов. Решения принимает политика харнесса — по классам конкретного вызова.
  readonly effects: readonly ToolEffect[];
  // Проверяет аргументы. При ошибке бросает ToolError с понятным модели текстом.
  prepare(rawArguments: unknown): PreparedToolCall;
}

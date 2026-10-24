// Словарь политики разрешений: что делает тул, с чем, и какое решение принимает харнесс.

// Классы действий. Тул объявляет, какие из них он выполняет.
// Главный вопрос для каждого класса — можно ли действие отменить:
// чтение ничего не меняет, запись можно исправить, удаление — нет,
// а запрос в сеть отправляет данные за пределы компьютера.
export const TOOL_EFFECTS = ['read', 'write', 'delete', 'network'] as const;

export type ToolEffect = (typeof TOOL_EFFECTS)[number];

// allow — выполнить сразу, ask — спросить пользователя, deny — запретить.
export const PERMISSION_DECISIONS = ['allow', 'ask', 'deny'] as const;

export type PermissionDecision = (typeof PERMISSION_DECISIONS)[number];

// С чем работает вызов: по этим целям проверяются правила по аргументам.
export type ActionTarget = { kind: 'path'; path: string } | { kind: 'host'; host: string };

// Откуда взялось решение — шаги проверки в фиксированном порядке.
export type PermissionCheckSource = 'rule' | 'tool' | 'effect' | 'default';

export interface PermissionCheck {
  source: PermissionCheckSource;
  // Что проверялось, по-человечески: «Регламенты — только чтение», «класс действия: delete».
  label: string;
  matched: boolean;
  // Решение этой проверки; null — проверка не сработала.
  decision: PermissionDecision | null;
}

export interface PermissionEvaluation {
  decision: PermissionDecision;
  // Почему принято именно это решение — одной фразой.
  reason: string;
  // Все проверки по порядку, включая несработавшие: так виден весь путь к решению.
  checks: PermissionCheck[];
}

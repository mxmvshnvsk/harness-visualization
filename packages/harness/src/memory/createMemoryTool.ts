// Тул memory — как memory tool Anthropic: одна точка входа, команда в поле command.
// https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool
// Схема плоская (command и поля), без anyOf: так её примет любой OpenAI-совместимый провайдер;
// какие поля нужны команде — проверяется при вызове.

import { z } from 'zod';
import type { ToolEffect } from '../permissions/permissionTypes.js';
import { ToolError } from '../tools/ToolError.js';
import { defineTool } from '../tools/defineTool.js';
import type { Tool } from '../tools/toolTypes.js';
import type { MemoryStore } from './MemoryStore.js';
import { MEMORY_ROOT, toWorkspacePath } from './memoryPaths.js';

const COMMANDS = ['view', 'create', 'str_replace', 'insert', 'delete', 'rename'] as const;

const argumentsSchema = z.object({
  command: z.enum(COMMANDS).describe('Что сделать с памятью'),
  path: z.string().optional().describe(`Путь в ${MEMORY_ROOT}: для всех команд, кроме rename`),
  view_range: z
    .tuple([z.number().int(), z.number().int()])
    .optional()
    .describe('view: [первая строка, последняя строка], -1 — до конца файла'),
  file_text: z.string().optional().describe('create: текст нового файла'),
  old_str: z
    .string()
    .optional()
    .describe('str_replace: текст, который заменить, — дословно и один раз'),
  new_str: z.string().optional().describe('str_replace: чем заменить; нет — old_str удаляется'),
  insert_line: z
    .number()
    .int()
    .optional()
    .describe('insert: после какой строки вставить, 0 — в начало'),
  insert_text: z.string().optional().describe('insert: что вставить'),
  old_path: z.string().optional().describe('rename: что переименовать'),
  new_path: z.string().optional().describe('rename: новый путь'),
});

type MemoryArguments = z.infer<typeof argumentsSchema>;

const EFFECTS: Record<MemoryArguments['command'], ToolEffect> = {
  view: 'read',
  create: 'write',
  str_replace: 'write',
  insert: 'write',
  delete: 'delete',
  rename: 'write',
};

export function createMemoryTool(store: MemoryStore): Tool {
  return defineTool({
    name: 'memory',
    description:
      `Память между сессиями — папка ${MEMORY_ROOT}. Команды: view (папка или файл с номерами строк), ` +
      'create (новый файл), str_replace (заменить фрагмент), insert (вставить строки), ' +
      'delete (удалить), rename (переименовать или перенести).',
    argumentsSchema,
    effects: ['read', 'write', 'delete'],
    effectsOf: (toolArguments) => [EFFECTS[toolArguments.command]],
    describeAction: describe,
    targets: (toolArguments) =>
      [toolArguments.path, toolArguments.old_path, toolArguments.new_path].flatMap((path) =>
        path === undefined ? [] : [{ kind: 'path' as const, path: safeWorkspacePath(path) }],
      ),
    execute: (toolArguments) => run(store, toolArguments),
  });
}

function run(store: MemoryStore, toolArguments: MemoryArguments): Promise<string> {
  switch (toolArguments.command) {
    case 'view':
      return store.view(required(toolArguments, 'path'), toolArguments.view_range ?? null);
    case 'create':
      return store.create(required(toolArguments, 'path'), required(toolArguments, 'file_text'));
    case 'str_replace':
      return store.replace(
        required(toolArguments, 'path'),
        required(toolArguments, 'old_str'),
        toolArguments.new_str ?? '',
      );
    case 'insert':
      return store.insert(
        required(toolArguments, 'path'),
        required(toolArguments, 'insert_line'),
        required(toolArguments, 'insert_text'),
      );
    case 'delete':
      return store.delete(required(toolArguments, 'path'));
    case 'rename':
      return store.rename(required(toolArguments, 'old_path'), required(toolArguments, 'new_path'));
  }
}

function required<Key extends keyof MemoryArguments>(
  toolArguments: MemoryArguments,
  key: Key,
): NonNullable<MemoryArguments[Key]> {
  const value = toolArguments[key];
  if (value === undefined || value === null) {
    throw new ToolError(`Команде ${toolArguments.command} нужно поле ${key}`);
  }
  return value;
}

function describe(toolArguments: MemoryArguments): string {
  const path = toolArguments.path ?? toolArguments.old_path ?? '';
  switch (toolArguments.command) {
    case 'view':
      return `Посмотреть память ${path}`;
    case 'rename':
      return `Переименовать в памяти ${path} → ${toolArguments.new_path ?? ''}`;
    case 'delete':
      return `Удалить из памяти ${path}`;
    default:
      return `Изменить память ${path} (${toolArguments.command})`;
  }
}

// Цель для политики — путь в песочнице; неверный путь отклонит сам вызов, политике он не нужен.
function safeWorkspacePath(path: string): string {
  try {
    return toWorkspacePath(path);
  } catch {
    return path;
  }
}

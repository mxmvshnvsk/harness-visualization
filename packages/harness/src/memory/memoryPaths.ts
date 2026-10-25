// Пути памяти. Модель видит память как /memories — так в спецификации memory tool Anthropic
// (https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool); на диске это
// папка memory/ в песочнице. Каждый путь проверяется: выйти из /memories нельзя — ни через
// «..», ни через закодированные «%2e%2e%2f», ни через обратный слеш.

import { posix } from 'node:path';
import { ToolError } from '../tools/ToolError.js';

export const MEMORY_ROOT = '/memories';
// Папка памяти от корня песочницы.
export const MEMORY_DIRECTORY = 'memory';
export const MEMO_PATH = `${MEMORY_ROOT}/memo.md`;

// /memories/notes/a.md → memory/notes/a.md
export function toWorkspacePath(memoryPath: string): string {
  assertSafe(memoryPath);
  const rest = posix.normalize(memoryPath.slice(MEMORY_ROOT.length).replace(/^\/+/, '') || '.');
  if (rest === '..' || rest.startsWith('../')) {
    throw new ToolError(`Путь выходит за пределы ${MEMORY_ROOT}: ${memoryPath}`);
  }
  return rest === '.' ? MEMORY_DIRECTORY : `${MEMORY_DIRECTORY}/${rest}`;
}

function assertSafe(memoryPath: string): void {
  if (memoryPath !== MEMORY_ROOT && !memoryPath.startsWith(`${MEMORY_ROOT}/`)) {
    throw new ToolError(`Путь должен начинаться с ${MEMORY_ROOT}: ${memoryPath}`);
  }
  if (/[\\%\0]/.test(memoryPath) || memoryPath.split('/').includes('..')) {
    throw new ToolError(`Недопустимый путь: ${memoryPath}`);
  }
}

// memory/notes/a.md → /memories/notes/a.md
export function toMemoryPath(workspacePath: string): string {
  return workspacePath === MEMORY_DIRECTORY
    ? MEMORY_ROOT
    : `${MEMORY_ROOT}${workspacePath.slice(MEMORY_DIRECTORY.length)}`;
}

export function isMemoryRoot(memoryPath: string): boolean {
  return toWorkspacePath(memoryPath) === MEMORY_DIRECTORY;
}

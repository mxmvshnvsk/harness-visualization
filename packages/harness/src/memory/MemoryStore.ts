// Память агента — папка /memories (memory/ в песочнице), живёт между сессиями. Команды —
// как у memory tool Anthropic: view, create, str_replace, insert, delete, rename; ответы —
// по смыслу те же, что в спецификации, по-русски. Каждая правка — событие memory_updated.

import type { Dirent } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { EventStream } from '../events/EventStream.js';
import { ToolError } from '../tools/ToolError.js';
import type { Workspace } from '../workspace/Workspace.js';
import { isMemoryRoot, MEMORY_ROOT, toMemoryPath, toWorkspacePath } from './memoryPaths.js';

// Файл памяти целиком в контекст не кладём: длиннее — постранично, через view_range.
const MAX_VIEW_CHARACTERS = 20_000;
const MAX_LINES = 999_999;
// Сколько строк вокруг правки показать после str_replace.
const SNIPPET_CONTEXT = 4;

export type MemoryCommand = 'create' | 'str_replace' | 'insert' | 'delete' | 'rename';

export class MemoryStore {
  constructor(
    private readonly workspace: Workspace,
    private readonly events: EventStream,
  ) {}

  async view(path: string, range: readonly [number, number] | null): Promise<string> {
    const absolute = this.absolute(path);
    const info = await statOrNull(absolute);
    if (info === null) {
      if (isMemoryRoot(path)) {
        return `Файлы и папки в ${MEMORY_ROOT} (до 2 уровней, без скрытых):\n0B\t${MEMORY_ROOT}`;
      }
      throw new ToolError(`Путь ${path} не существует. Укажите существующий путь.`);
    }
    return info.isDirectory()
      ? this.listDirectory(path, absolute)
      : this.viewFile(path, absolute, range);
  }

  async create(path: string, fileText: string): Promise<string> {
    const absolute = this.absolute(path);
    if ((await statOrNull(absolute)) !== null) {
      throw new ToolError(`Ошибка: файл ${path} уже существует`);
    }
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, fileText, 'utf8');
    this.changed('create', path, null);
    return `Файл создан: ${path}`;
  }

  async replace(path: string, oldText: string, newText: string): Promise<string> {
    const { absolute, text } = await this.readExisting(path);
    const positions = occurrences(text, oldText);
    if (positions.length === 0) {
      throw new ToolError(
        `Замена не выполнена: old_str \`${oldText}\` не встречается дословно в ${path}.`,
      );
    }
    if (positions.length > 1) {
      const lines = positions.map((position) => lineOf(text, position)).join(', ');
      throw new ToolError(
        `Замена не выполнена: old_str \`${oldText}\` встречается несколько раз, строки ${lines}. Сделайте его уникальным.`,
      );
    }
    const position = positions[0] ?? 0;
    const updated = text.slice(0, position) + newText + text.slice(position + oldText.length);
    await writeFile(absolute, updated, 'utf8');
    this.changed('str_replace', path, null);
    return `Файл памяти изменён.\n${snippet(updated, lineOf(updated, position))}`;
  }

  async insert(path: string, insertLine: number, insertText: string): Promise<string> {
    const { absolute, text } = await this.readExisting(path);
    const lines = text.split('\n');
    if (!Number.isInteger(insertLine) || insertLine < 0 || insertLine > lines.length) {
      throw new ToolError(
        `Ошибка: неверный insert_line ${String(insertLine)}. Допустимо от 0 до ${String(lines.length)}.`,
      );
    }
    lines.splice(insertLine, 0, ...insertText.replace(/\n$/, '').split('\n'));
    await writeFile(absolute, lines.join('\n'), 'utf8');
    this.changed('insert', path, null);
    return `Файл ${path} изменён.`;
  }

  async delete(path: string): Promise<string> {
    if (isMemoryRoot(path)) {
      throw new ToolError(`Ошибка: нельзя удалить саму папку ${MEMORY_ROOT}`);
    }
    const absolute = this.absolute(path);
    if ((await statOrNull(absolute)) === null) {
      throw new ToolError(`Ошибка: путь ${path} не существует`);
    }
    await rm(absolute, { recursive: true });
    this.changed('delete', path, null);
    return `Удалено: ${path}`;
  }

  async rename(oldPath: string, newPath: string): Promise<string> {
    if (isMemoryRoot(oldPath)) {
      throw new ToolError(`Ошибка: нельзя переименовать саму папку ${MEMORY_ROOT}`);
    }
    const from = this.absolute(oldPath);
    const to = this.absolute(newPath);
    if ((await statOrNull(from)) === null) {
      throw new ToolError(`Ошибка: путь ${oldPath} не существует`);
    }
    if ((await statOrNull(to)) !== null) {
      throw new ToolError(`Ошибка: ${newPath} уже существует`);
    }
    await mkdir(dirname(to), { recursive: true });
    await rename(from, to);
    this.changed('rename', oldPath, newPath);
    return `Переименовано: ${oldPath} → ${newPath}`;
  }

  // Текст файла или null, если его нет: для memo.md в system prompt.
  async readOrNull(path: string): Promise<string | null> {
    try {
      return await readFile(this.absolute(path), 'utf8');
    } catch {
      return null;
    }
  }

  // Все файлы памяти — пути /memories/…
  async files(): Promise<string[]> {
    const entries = await this.entries(this.absolute(MEMORY_ROOT));
    return entries.filter((entry) => entry.isFile()).map((entry) => this.memoryPathOf(entry));
  }

  private absolute(path: string): string {
    return this.workspace.resolvePath(toWorkspacePath(path));
  }

  private memoryPathOf(entry: Dirent): string {
    return toMemoryPath(this.workspace.toWorkspacePath(join(entry.parentPath, entry.name)));
  }

  private async readExisting(path: string): Promise<{ absolute: string; text: string }> {
    const absolute = this.absolute(path);
    const info = await statOrNull(absolute);
    if (info === null || info.isDirectory()) {
      throw new ToolError(`Ошибка: путь ${path} не существует или это папка`);
    }
    return { absolute, text: await readFile(absolute, 'utf8') };
  }

  private async entries(absolute: string): Promise<Dirent[]> {
    try {
      return await readdir(absolute, { recursive: true, withFileTypes: true });
    } catch {
      return [];
    }
  }

  private async listDirectory(path: string, absolute: string): Promise<string> {
    const lines: string[] = [];
    let total = 0;
    for (const entry of await this.entries(absolute)) {
      const relativeDepth = this.memoryPathOf(entry).slice(path.length).split('/').length - 1;
      const hidden = this.memoryPathOf(entry)
        .split('/')
        .some((part) => part.startsWith('.'));
      if (hidden || entry.name === 'node_modules' || relativeDepth > 2) {
        continue;
      }
      const size = entry.isFile() ? (await stat(join(entry.parentPath, entry.name))).size : 0;
      total += size;
      lines.push(`${humanSize(size)}\t${this.memoryPathOf(entry)}`);
    }
    return [
      `Файлы и папки в ${path} (до 2 уровней, без скрытых):`,
      `${humanSize(total)}\t${path}`,
      ...lines.sort(
        (left, right) => left.split('\t')[1]?.localeCompare(right.split('\t')[1] ?? '') ?? 0,
      ),
    ].join('\n');
  }

  private async viewFile(
    path: string,
    absolute: string,
    range: readonly [number, number] | null,
  ): Promise<string> {
    const lines = (await readFile(absolute, 'utf8')).split('\n');
    if (lines.length > MAX_LINES) {
      throw new ToolError(`Файл ${path} длиннее ${String(MAX_LINES)} строк.`);
    }
    const start = range === null ? 1 : Math.max(1, range[0]);
    const end = range === null || range[1] === -1 ? lines.length : Math.min(lines.length, range[1]);
    const numbered = lines
      .slice(start - 1, end)
      .map((line, index) => `${String(start + index).padStart(6)}\t${line}`)
      .join('\n');
    const shown =
      numbered.length <= MAX_VIEW_CHARACTERS
        ? numbered
        : `${numbered.slice(0, MAX_VIEW_CHARACTERS)}\n[Показано ${String(MAX_VIEW_CHARACTERS)} символов — остальное через view_range]`;
    return `Содержимое ${path} с номерами строк:\n${shown}`;
  }

  private changed(command: MemoryCommand, path: string, newPath: string | null): void {
    this.events.emit({ type: 'memory_updated', command, path, newPath });
  }
}

async function statOrNull(absolute: string): Promise<Awaited<ReturnType<typeof stat>> | null> {
  try {
    return await stat(absolute);
  } catch {
    return null;
  }
}

function occurrences(text: string, search: string): number[] {
  const positions: number[] = [];
  if (search === '') {
    return positions;
  }
  for (let index = text.indexOf(search); index !== -1; index = text.indexOf(search, index + 1)) {
    positions.push(index);
  }
  return positions;
}

function lineOf(text: string, position: number): number {
  return text.slice(0, position).split('\n').length;
}

function snippet(text: string, line: number): string {
  const lines = text.split('\n');
  const start = Math.max(1, line - SNIPPET_CONTEXT);
  const end = Math.min(lines.length, line + SNIPPET_CONTEXT);
  return lines
    .slice(start - 1, end)
    .map((content, index) => `${String(start + index).padStart(6)}\t${content}`)
    .join('\n');
}

function humanSize(bytes: number): string {
  if (bytes < 1024) {
    return `${String(bytes)}B`;
  }
  const kilobytes = bytes / 1024;
  return kilobytes < 1024 ? `${kilobytes.toFixed(1)}K` : `${(kilobytes / 1024).toFixed(1)}M`;
}

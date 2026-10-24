// Песочница — папка, внутри которой работают файловые тулы.
// Любой путь от модели проверяется: выйти за пределы папки нельзя,
// поэтому модель не прочитает и не перезапишет ничего за её пределами.

import type { Dirent } from 'node:fs';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { ToolError } from '../tools/ToolError.js';

export interface WorkspaceEntry {
  // Путь от корня песочницы, с прямыми слешами: notes/plan.md.
  path: string;
  isDirectory: boolean;
  sizeBytes: number;
}

export class Workspace {
  readonly rootDirectory: string;

  constructor(rootDirectory: string) {
    this.rootDirectory = resolve(rootDirectory);
  }

  resolvePath(workspacePath: string): string {
    if (isAbsolute(workspacePath)) {
      throw new ToolError(
        `Путь должен быть относительным, от корня рабочей папки: ${workspacePath}`,
      );
    }
    const absolutePath = resolve(this.rootDirectory, workspacePath);
    if (!this.isInside(absolutePath)) {
      throw new ToolError(`Путь выходит за пределы рабочей папки: ${workspacePath}`);
    }
    return absolutePath;
  }

  toWorkspacePath(absolutePath: string): string {
    const relativePath = relative(this.rootDirectory, absolutePath);
    return relativePath.split(sep).join('/');
  }

  async readText(workspacePath: string): Promise<string> {
    const absolutePath = this.resolvePath(workspacePath);
    try {
      return await readFile(absolutePath, 'utf8');
    } catch (error) {
      throw translateFileError(error, workspacePath);
    }
  }

  // Возвращает число записанных байт.
  async writeText(workspacePath: string, content: string): Promise<number> {
    const absolutePath = this.resolvePath(workspacePath);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content, 'utf8');
    return Buffer.byteLength(content, 'utf8');
  }

  // Проверяет, что по пути лежит файл (а не папка и не пустота). Возвращает абсолютный путь.
  async assertExistingFile(workspacePath: string): Promise<string> {
    const absolutePath = this.resolvePath(workspacePath);
    let isDirectory: boolean;
    try {
      isDirectory = (await stat(absolutePath)).isDirectory();
    } catch (error) {
      throw translateFileError(error, workspacePath);
    }
    if (isDirectory) {
      throw new ToolError(`Это папка, а не файл: ${workspacePath}`);
    }
    return absolutePath;
  }

  // Удаляет только файлы: папку целиком модель удалить не может.
  async deleteFile(workspacePath: string): Promise<void> {
    const absolutePath = await this.assertExistingFile(workspacePath);
    await rm(absolutePath);
  }

  async listEntries(workspacePath: string): Promise<WorkspaceEntry[]> {
    const absoluteDirectory = this.resolvePath(workspacePath);
    const directoryEntries = await readDirectoryRecursively(absoluteDirectory, workspacePath);
    const entries: WorkspaceEntry[] = [];
    for (const directoryEntry of directoryEntries) {
      const absolutePath = join(directoryEntry.parentPath, directoryEntry.name);
      const isDirectory = directoryEntry.isDirectory();
      const sizeBytes = isDirectory ? 0 : (await stat(absolutePath)).size;
      entries.push({ path: this.toWorkspacePath(absolutePath), isDirectory, sizeBytes });
    }
    return entries.sort((first, second) => first.path.localeCompare(second.path));
  }

  private isInside(absolutePath: string): boolean {
    const relativePath = relative(this.rootDirectory, absolutePath);
    const leavesRoot = relativePath === '..' || relativePath.startsWith(`..${sep}`);
    return !leavesRoot && !isAbsolute(relativePath);
  }
}

async function readDirectoryRecursively(
  absoluteDirectory: string,
  workspacePath: string,
): Promise<Dirent[]> {
  try {
    return await readdir(absoluteDirectory, { recursive: true, withFileTypes: true });
  } catch (error) {
    throw translateFileError(error, workspacePath);
  }
}

// Ошибки файловой системы пишутся по-английски и с абсолютными путями.
// Модели полезнее короткое понятное сообщение с путём внутри песочницы.
function translateFileError(error: unknown, workspacePath: string): Error {
  if (hasErrorCode(error, 'ENOENT')) {
    return new ToolError(`Не найдено: ${workspacePath}`);
  }
  if (hasErrorCode(error, 'EISDIR')) {
    return new ToolError(`Это папка, а не файл: ${workspacePath}`);
  }
  if (hasErrorCode(error, 'ENOTDIR')) {
    return new ToolError(`Это файл, а не папка: ${workspacePath}`);
  }
  return error instanceof Error ? error : new Error(String(error));
}

function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

// Копия проекта для прогона (этап 10): проект + изменения задачи + TASK.md + тексты
// регламентов. Агент работает только в копии; скрытые тесты (acceptance/) и эталонное
// решение (solution/) в неё не попадают.

import { existsSync } from 'node:fs';
import { cp, mkdir, readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { ARENA_PROJECT, tasksDirectory } from './arenaTasks.js';

// Регламенты, на которые ссылается код проекта, — из базы знаний «Кедр Софт».
const REGULATIONS = ['vacation', 'businessTrips', 'expenses', 'sickLeave'];
const REGULATIONS_SOURCE = join('packages', 'mcp-server', 'data', 'regulations');

export interface ArenaCopyRequest {
  projectRoot: string;
  arenaRoot: string;
  taskId: string;
  directory: string;
  // Наложить эталонное решение — для pnpm arena --verify.
  withSolution: boolean;
}

export async function prepareArenaCopy(request: ArenaCopyRequest): Promise<void> {
  const taskDirectory = join(tasksDirectory(request.arenaRoot), request.taskId);
  await mkdir(request.directory, { recursive: true });
  await cp(join(request.arenaRoot, ARENA_PROJECT), request.directory, {
    recursive: true,
    filter: (source) => !source.includes('node_modules'),
  });
  await copyIfExists(join(taskDirectory, 'files'), request.directory);
  await cp(join(taskDirectory, 'TASK.md'), join(request.directory, 'TASK.md'));
  const regulations = join(request.directory, 'docs', 'regulations');
  await mkdir(regulations, { recursive: true });
  for (const name of REGULATIONS) {
    await cp(
      join(request.projectRoot, REGULATIONS_SOURCE, `${name}.md`),
      join(regulations, `${name}.md`),
    );
  }
  if (request.withSolution) {
    await copyIfExists(join(taskDirectory, 'solution'), request.directory);
  }
}

async function copyIfExists(source: string, target: string): Promise<void> {
  if (existsSync(source)) {
    await cp(source, target, { recursive: true });
  }
}

// Видимые тесты до работы агента. Приёмка запускает их, а не то, что лежит в копии после
// агента: дописать свои тесты можно, а ослабить исходные — нет.
export async function readTestFiles(directory: string): Promise<Record<string, string>> {
  const testDirectory = join(directory, 'test');
  if (!existsSync(testDirectory)) {
    return {};
  }
  const files = await readdir(testDirectory, { recursive: true, withFileTypes: true });
  const contents: Record<string, string> = {};
  for (const file of files.filter((entry) => entry.isFile())) {
    const path = join(file.parentPath, file.name);
    contents[relative(directory, path).split(sep).join('/')] = await readFile(path, 'utf8');
  }
  return contents;
}

// Все файлы копии, пути от её корня: до работы агента и после — так видно, что он добавил.
export async function listCopyFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(directory, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .sort();
}

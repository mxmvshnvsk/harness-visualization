// Свободный режим Код-арены (этап 10.4): простая песочница — проект с нуля, задача словами,
// принимает пользователь. Проекты живут в workspaces/arena/free/<имя> между сессиями.
// Начать можно и с копии своей папки: копируется как есть, вместе с node_modules — ставить
// зависимости в арене нельзя (нет сети), поэтому их готовят заранее.

import { existsSync } from 'node:fs';
import { cp, mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import type { ArenaSettings, ContextPreset } from '../settings/settingsSchema.js';
import type { ArenaSessionInput } from './arenaSession.js';

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,40}$/;
// Больше этого папку не копируем: арена — песочница, а не место для чужого монорепозитория.
const MAX_COPY_FILES = 100_000;

export type FreeSource = { kind: 'new' } | { kind: 'continue' } | { kind: 'copy'; from: string };

export interface FreeProject {
  name: string;
  // Файлов без node_modules и .git.
  files: number;
  updatedAt: string;
  hasNodeModules: boolean;
}

export function freeProjectsDirectory(projectRoot: string, settings: ArenaSettings): string {
  return resolve(projectRoot, settings.workspaceDirectory, 'free');
}

export async function listFreeProjects(
  projectRoot: string,
  settings: ArenaSettings,
): Promise<FreeProject[]> {
  const root = freeProjectsDirectory(projectRoot, settings);
  if (!existsSync(root)) {
    return [];
  }
  const entries = await readdir(root, { withFileTypes: true });
  const projects = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && NAME_PATTERN.test(entry.name))
      .map((entry) => describeProject(join(root, entry.name), entry.name)),
  );
  return projects.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

async function describeProject(directory: string, name: string): Promise<FreeProject> {
  const files = await projectFiles(directory);
  const times = await Promise.all(
    files.map(async (file) => (await stat(join(directory, file))).mtimeMs),
  );
  const updated = times.length === 0 ? (await stat(directory)).mtimeMs : Math.max(...times);
  return {
    name,
    files: files.length,
    updatedAt: new Date(updated).toISOString(),
    hasNodeModules: existsSync(join(directory, 'node_modules')),
  };
}

async function projectFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(directory.length + 1))
    .filter((path) => !/(^|[/\\])(node_modules|\.git)([/\\]|$)/.test(path));
}

export interface FreeRunRequest {
  projectRoot: string;
  settings: ArenaSettings;
  name: string;
  source: FreeSource;
  contextPreset?: ContextPreset | null;
  maxIterations?: number | null;
}

export async function prepareFreeRun(request: FreeRunRequest): Promise<ArenaSessionInput> {
  if (!NAME_PATTERN.test(request.name)) {
    throw new Error('Имя проекта: латиница в нижнем регистре, цифры и дефис, до 41 символа');
  }
  const directory = join(
    freeProjectsDirectory(request.projectRoot, request.settings),
    request.name,
  );
  await prepareDirectory(directory, request.name, request.source);
  return {
    task: null,
    project: request.name,
    directory,
    runTests: true,
    runNode: true,
    originalTests: {},
    originalFiles: [],
    contextPreset: request.contextPreset ?? request.settings.contextPreset,
    maxIterations: request.maxIterations ?? request.settings.maxIterations,
  };
}

async function prepareDirectory(
  directory: string,
  name: string,
  source: FreeSource,
): Promise<void> {
  if (source.kind === 'continue') {
    if (!existsSync(directory)) {
      throw new Error(`Нет проекта «${name}»`);
    }
    return;
  }
  if (existsSync(directory)) {
    throw new Error(`Проект «${name}» уже есть — продолжите его или выберите другое имя`);
  }
  if (source.kind === 'new') {
    await createEmptyProject(directory, name);
  } else {
    await copyFolder(source.from, directory);
  }
}

async function createEmptyProject(directory: string, name: string): Promise<void> {
  await mkdir(join(directory, 'test'), { recursive: true });
  const packageJson = {
    name,
    version: '0.0.0',
    private: true,
    type: 'module',
    scripts: { test: 'node --test' },
  };
  await writeFile(join(directory, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`);
}

// Копия как есть, вместе с node_modules; .git не копируем — история проекта агенту не нужна.
async function copyFolder(from: string, directory: string): Promise<void> {
  if (!isAbsolute(from) || !existsSync(from) || !(await stat(from)).isDirectory()) {
    throw new Error(`Папки нет или путь не абсолютный: ${from}`);
  }
  const count = (await readdir(from, { recursive: true })).length;
  if (count > MAX_COPY_FILES) {
    throw new Error(
      `В папке ${String(count)} файлов — больше ${String(MAX_COPY_FILES)}: для песочницы слишком много`,
    );
  }
  await cp(from, directory, {
    recursive: true,
    filter: (source) => !/(^|[/\\])\.git([/\\]|$)/.test(source.slice(from.length)),
  });
}

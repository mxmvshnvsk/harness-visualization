// Готовит песочницу к работе:
//   - если папки ещё нет, копирует в неё примеры файлов;
//   - с reset (флаг --fresh) удаляет папку и создаёт её заново из примеров,
//     чтобы сессия начиналась с чистого листа, без заметок прошлых сессий.

import { existsSync } from 'node:fs';
import { cp, mkdir, rm } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export interface WorkspacePreparationRequest {
  projectRoot: string;
  workspaceDirectory: string;
  // null — примеров нет: папка создаётся пустой (сессия без демо-проекта).
  seedDirectory: string | null;
  reset: boolean;
}

export interface PreparedWorkspace {
  // true — папка создана только что из примеров.
  createdFromSeed: boolean;
  // true — прежняя папка удалена по флагу --fresh.
  wasReset: boolean;
}

export async function prepareWorkspace(
  request: WorkspacePreparationRequest,
): Promise<PreparedWorkspace> {
  const wasReset = request.reset && existsSync(request.workspaceDirectory);
  if (wasReset) {
    assertInsideProject(request.projectRoot, request.workspaceDirectory);
    await rm(request.workspaceDirectory, { recursive: true });
  }
  if (existsSync(request.workspaceDirectory)) {
    return { createdFromSeed: false, wasReset };
  }
  if (request.seedDirectory !== null && existsSync(request.seedDirectory)) {
    await cp(request.seedDirectory, request.workspaceDirectory, { recursive: true });
    return { createdFromSeed: true, wasReset };
  }
  await mkdir(request.workspaceDirectory, { recursive: true });
  return { createdFromSeed: false, wasReset };
}

// Удаляем папку целиком, поэтому проверяем, что ошибка в конфиге
// (например, "directory": "..") не приведёт к удалению чего-то за пределами проекта.
function assertInsideProject(projectRoot: string, workspaceDirectory: string): void {
  const relativePath = relative(resolve(projectRoot), resolve(workspaceDirectory));
  const isProjectRoot = relativePath === '';
  const leavesProject = relativePath === '..' || relativePath.startsWith(`..${sep}`);
  if (isProjectRoot || leavesProject || isAbsolute(relativePath)) {
    throw new Error(
      `Отказ удалять ${workspaceDirectory}: рабочая папка должна быть внутри проекта и не совпадать с ним. ` +
        'Проверьте workspace.directory в harness.config.json.',
    );
  }
}

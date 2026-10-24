// Готовит песочницу к работе: если папки ещё нет, копирует в неё примеры файлов.
// Чтобы вернуть песочницу в исходное состояние, достаточно удалить её папку.

import { existsSync } from 'node:fs';
import { cp, mkdir } from 'node:fs/promises';

export interface PreparedWorkspace {
  // true — папка создана только что из примеров.
  createdFromSeed: boolean;
}

export async function prepareWorkspace(
  workspaceDirectory: string,
  seedDirectory: string,
): Promise<PreparedWorkspace> {
  if (existsSync(workspaceDirectory)) {
    return { createdFromSeed: false };
  }
  if (existsSync(seedDirectory)) {
    await cp(seedDirectory, workspaceDirectory, { recursive: true });
    return { createdFromSeed: true };
  }
  await mkdir(workspaceDirectory, { recursive: true });
  return { createdFromSeed: false };
}

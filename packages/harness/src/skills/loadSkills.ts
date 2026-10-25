// Каталог скиллов: каждая папка в skills.directory с файлом SKILL.md. Режим скилла — из
// настроек: always и manual перечислены по именам, остальные — on_demand. Папка не читается
// как скилл — она попадает в problems, а сессия идёт дальше без неё.

import type { Dirent } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import type { SkillsSettings } from '../settings/settingsSchema.js';
import { parseSkillFile } from './parseSkillFile.js';
import type { Skill, SkillMode, SkillProblem } from './skillTypes.js';

export interface SkillCatalog {
  skills: Skill[];
  problems: SkillProblem[];
}

// Глубже в папку скилла не смотрим: дополнительные файлы — рядом или во вложенной папке.
const MAX_DEPTH = 3;

export async function loadSkills(
  directory: string,
  settings: SkillsSettings,
): Promise<SkillCatalog> {
  const folders = await listFolders(directory);
  const skills: Skill[] = [];
  const problems: SkillProblem[] = [];
  for (const folder of folders) {
    try {
      skills.push(await loadSkill(join(directory, folder), folder, settings));
    } catch (error) {
      problems.push({ folder, message: error instanceof Error ? error.message : String(error) });
    }
  }
  const known = new Set(skills.map((skill) => skill.name));
  for (const name of [...settings.always, ...settings.manual]) {
    if (!known.has(name)) {
      problems.push({ folder: name, message: 'скилл указан в настройках skills, но не найден' });
    }
  }
  return { skills, problems };
}

async function listFolders(directory: string): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    // Папки скиллов нет — каталог пуст, это не ошибка.
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort();
}

async function loadSkill(
  folderPath: string,
  folder: string,
  settings: SkillsSettings,
): Promise<Skill> {
  let text: string;
  try {
    text = await readFile(join(folderPath, 'SKILL.md'), 'utf8');
  } catch {
    throw new Error('нет файла SKILL.md');
  }
  const parsed = parseSkillFile(text);
  if (parsed.name !== folder) {
    throw new Error(`name «${parsed.name}» не совпадает с именем папки «${folder}»`);
  }
  return {
    ...parsed,
    mode: modeOf(parsed.name, settings),
    files: (await listFiles(folderPath, folderPath, 1)).filter((file) => file !== 'SKILL.md'),
    directory: folderPath,
  };
}

function modeOf(name: string, settings: SkillsSettings): SkillMode {
  if (settings.always.includes(name)) {
    return 'always';
  }
  return settings.manual.includes(name) ? 'manual' : 'on_demand';
}

async function listFiles(root: string, directory: string, depth: number): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(directory, entry.name);
    if (entry.name.startsWith('.')) {
      continue;
    }
    if (entry.isDirectory() && depth < MAX_DEPTH) {
      files.push(...(await listFiles(root, path, depth + 1)));
    } else if (entry.isFile()) {
      files.push(relative(root, path).split(sep).join('/'));
    }
  }
  return files;
}

// Заготовленные задачи Код-арены (этап 10): arena/tasks/<id>/task.json и TASK.md.
// Как устроена задача — в arena/README.md.

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

// Проект, к которому относятся задачи «Кедр Софт».
export const ARENA_PROJECT = 'kedr-hr';

const taskSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  // починить, написать, переделать, ловушка — для людей, на поведение харнесса не влияет.
  kind: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  // Чему учит задача — показывается в интерфейсе.
  lesson: z.string().min(1),
  // Видимые тесты, которые агенту можно менять: остальные приёмка сверяет с исходными.
  editableTests: z.array(z.string()).default([]),
});

export type ArenaTask = z.infer<typeof taskSchema>;

export interface ArenaTaskDetails extends ArenaTask {
  text: string;
}

export function tasksDirectory(arenaRoot: string): string {
  return join(arenaRoot, 'tasks');
}

export async function listArenaTasks(arenaRoot: string): Promise<ArenaTask[]> {
  const entries = await readdir(tasksDirectory(arenaRoot), { withFileTypes: true });
  const tasks = await Promise.all(
    entries.filter((entry) => entry.isDirectory()).map((entry) => readTask(arenaRoot, entry.name)),
  );
  return tasks.sort((left, right) => left.id.localeCompare(right.id));
}

export async function readArenaTask(arenaRoot: string, taskId: string): Promise<ArenaTaskDetails> {
  const task = await readTask(arenaRoot, taskId);
  const text = await readFile(join(tasksDirectory(arenaRoot), taskId, 'TASK.md'), 'utf8');
  return { ...task, text };
}

async function readTask(arenaRoot: string, taskId: string): Promise<ArenaTask> {
  if (!/^[a-z][a-z0-9-]*$/.test(taskId)) {
    throw new Error(`Нет такой задачи арены: ${taskId}`);
  }
  const path = join(tasksDirectory(arenaRoot), taskId, 'task.json');
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    throw new Error(`Нет такой задачи арены: ${taskId}`);
  }
  const task = taskSchema.parse(JSON.parse(raw));
  if (task.id !== taskId) {
    throw new Error(`В ${path} id «${task.id}», а папка — «${taskId}»`);
  }
  return task;
}

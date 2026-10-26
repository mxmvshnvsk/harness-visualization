// Сохраняет переведённую чужую запись как наш трейс: имя — время начала сессии
// и id с префиксом харнесса, чтобы импорт не путался с нашими прогонами.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { HarnessEvent } from '../events/harnessEvents.js';

export async function writeImportedTrace(
  directory: string,
  events: readonly HarnessEvent[],
  prefix: string,
): Promise<string> {
  const first = events[0];
  if (first === undefined) {
    throw new Error('Пустая запись: нечего сохранять');
  }
  const stamp = first.timestamp.slice(0, 19).replaceAll(':', '-');
  const filePath = join(directory, `${stamp}_${prefix}-${first.sessionId}.jsonl`);
  await mkdir(directory, { recursive: true });
  await writeFile(filePath, events.map((event) => `${JSON.stringify(event)}\n`).join(''), 'utf8');
  return filePath;
}

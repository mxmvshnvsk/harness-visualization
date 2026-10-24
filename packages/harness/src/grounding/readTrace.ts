// Читает файл трейса: одно событие — одна строка JSON.

import { readFile } from 'node:fs/promises';
import type { HarnessEvent } from '../events/harnessEvents.js';

export async function readTrace(filePath: string): Promise<HarnessEvent[]> {
  const fileText = await readFile(filePath, 'utf8');
  return fileText
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line, index) => parseEventLine(line, index + 1, filePath));
}

function parseEventLine(line: string, lineNumber: number, filePath: string): HarnessEvent {
  try {
    return JSON.parse(line) as HarnessEvent;
  } catch {
    throw new Error(`${filePath}: строка ${lineNumber} — не корректный JSON`);
  }
}

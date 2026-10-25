// Чтение записанного трейса: файл JSONL, одно событие на строку.
// Схему событий не проверяем — трейс записал наш же харнесс; но строка, которая не разбирается
// или не похожа на событие (нет type и sequence), пропускается и учитывается в skippedLines:
// так обрезанный при сбое трейс всё равно можно посмотреть.

import { readFile } from 'node:fs/promises';
import type { HarnessEvent } from '@harness-visualization/harness';

export interface TraceContents {
  events: HarnessEvent[];
  skippedLines: number;
}

export async function readTraceFile(path: string): Promise<TraceContents> {
  const text = await readFile(path, 'utf8');
  const events: HarnessEvent[] = [];
  let skippedLines = 0;
  for (const line of text.split('\n')) {
    if (line.trim() === '') {
      continue;
    }
    const event = parseEvent(line);
    if (event === null) {
      skippedLines += 1;
    } else {
      events.push(event);
    }
  }
  return { events, skippedLines };
}

function parseEvent(line: string): HarnessEvent | null {
  try {
    const value: unknown = JSON.parse(line);
    return looksLikeEvent(value) ? value : null;
  } catch {
    return null;
  }
}

function looksLikeEvent(value: unknown): value is HarnessEvent {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof value.type === 'string' &&
    'sequence' in value &&
    typeof value.sequence === 'number'
  );
}

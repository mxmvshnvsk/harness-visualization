// Записывает события сессии в файл трейса: одно событие — одна строка JSON.
// По этому файлу сессию можно будет потом проиграть заново.

import { createWriteStream, type WriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { finished } from 'node:stream/promises';
import type { HarnessEvent } from './harnessEvents.js';

export class JsonlTraceWriter {
  readonly filePath: string;
  private readonly fileStream: WriteStream;

  private constructor(filePath: string) {
    this.filePath = filePath;
    this.fileStream = createWriteStream(filePath, { flags: 'a', encoding: 'utf8' });
  }

  static async open(directory: string, sessionId: string): Promise<JsonlTraceWriter> {
    await mkdir(directory, { recursive: true });
    const fileName = `${formatTimestampForFileName(new Date())}_${sessionId}.jsonl`;
    return new JsonlTraceWriter(join(directory, fileName));
  }

  write(event: HarnessEvent): void {
    this.fileStream.write(`${JSON.stringify(event)}\n`);
  }

  async close(): Promise<void> {
    this.fileStream.end();
    await finished(this.fileStream);
  }
}

// 2026-10-24T13:05:00.123Z → 2026-10-24T13-05-00: двоеточия нельзя в именах файлов на Windows.
function formatTimestampForFileName(date: Date): string {
  const isoWithoutMilliseconds = date.toISOString().slice(0, 19);
  return isoWithoutMilliseconds.replaceAll(':', '-');
}

// Запись сессии: поток событий и его подписчики — трейс, токеномика и консоль.
// Вынесена из runCliSession, чтобы другие команды могли записывать сессии так же.

import { randomUUID } from 'node:crypto';
import { join, relative } from 'node:path';
import { createConsolePrinter } from '../events/createConsolePrinter.js';
import { EventStream } from '../events/EventStream.js';
import { JsonlTraceWriter } from '../events/JsonlTraceWriter.js';
import { SessionTokenomics } from '../tokenomics/SessionTokenomics.js';

export interface SessionRecordingOptions {
  projectRoot: string;
  tracesDirectory: string;
  verbose: boolean;
  // true — ничего не печатать в консоль: сессию запускает другая команда, у неё свой вывод.
  quiet: boolean;
}

export interface SessionRecording {
  events: EventStream;
  // Пишет итог сессии, закрывает трейс и возвращает путь к нему от корня проекта.
  finish(): Promise<string>;
}

export async function startSessionRecording(
  options: SessionRecordingOptions,
): Promise<SessionRecording> {
  const events = new EventStream(createSessionId());
  const tokenomics = new SessionTokenomics();
  const traceWriter = await JsonlTraceWriter.open(
    join(options.projectRoot, options.tracesDirectory),
    events.sessionId,
  );

  // Порядок важен: токеномика должна учесть ответ модели раньше,
  // чем придёт событие об окончании сессии.
  events.subscribe((event) => traceWriter.write(event));
  events.subscribe((event) => tokenomics.handleEvent(event));
  if (!options.quiet) {
    events.subscribe(createConsolePrinter({ verbose: options.verbose }));
  }

  const startedAt = performance.now();
  return {
    events,
    async finish() {
      events.emit({
        type: 'session_finished',
        durationMs: Math.round(performance.now() - startedAt),
        ...tokenomics.summary(),
      });
      await traceWriter.close();
      const tracePath = relative(options.projectRoot, traceWriter.filePath);
      if (!options.quiet) {
        console.log(`Трейс сессии: ${tracePath}`);
      }
      return tracePath;
    },
  };
}

// Короткий идентификатор удобнее читать в консоли и в именах файлов.
function createSessionId(): string {
  return randomUUID().slice(0, 8);
}

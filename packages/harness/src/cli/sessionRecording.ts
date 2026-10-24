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
}

export interface SessionRecording {
  events: EventStream;
  // Пишет итог сессии и закрывает трейс.
  finish(): Promise<void>;
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
  events.subscribe(createConsolePrinter({ verbose: options.verbose }));

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
      console.log(`Трейс сессии: ${relative(options.projectRoot, traceWriter.filePath)}`);
    },
  };
}

// Короткий идентификатор удобнее читать в консоли и в именах файлов.
function createSessionId(): string {
  return randomUUID().slice(0, 8);
}

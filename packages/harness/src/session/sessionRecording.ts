// Запись сессии: поток событий и его подписчики — трейс, токеномика и те, кого передали
// снаружи (консоль у CLI, поток в браузер у сервера). Запись сама ничего не печатает.

import { randomUUID } from 'node:crypto';
import { join, relative } from 'node:path';
import { EventStream, type DeltaListener, type EventListener } from '../events/EventStream.js';
import { JsonlTraceWriter } from '../events/JsonlTraceWriter.js';
import { SessionTokenomics } from '../tokenomics/SessionTokenomics.js';

export interface SessionRecordingOptions {
  projectRoot: string;
  tracesDirectory: string;
  // Подписчики, которые получат все события сессии с первого — после трейса и токеномики.
  listeners: EventListener[];
  // Кусочки ответа модели вживую (этап 8d.2); в трейс не попадают.
  deltaListeners?: DeltaListener[];
}

export interface SessionRecording {
  events: EventStream;
  // Имя трейса без расширения — им же называется папка сессии без демо-проекта.
  name: string;
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
  for (const listener of options.listeners) {
    events.subscribe(listener);
  }
  for (const listener of options.deltaListeners ?? []) {
    events.subscribeDeltas(listener);
  }

  const startedAt = performance.now();
  return {
    events,
    name: traceWriter.name,
    async finish() {
      events.emit({
        type: 'session_finished',
        durationMs: Math.round(performance.now() - startedAt),
        ...tokenomics.summary(),
      });
      await traceWriter.close();
      return relative(options.projectRoot, traceWriter.filePath);
    },
  };
}

// Короткий идентификатор удобнее читать в консоли и в именах файлов.
function createSessionId(): string {
  return randomUUID().slice(0, 8);
}

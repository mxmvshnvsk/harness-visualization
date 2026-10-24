// Собирает сессию: поток событий, подписчиков, провайдера — и запускает один ход агента.

import { randomUUID } from 'node:crypto';
import { join, relative } from 'node:path';
import { runSingleTurn } from '../agent/runSingleTurn.js';
import { createConsolePrinter } from '../events/createConsolePrinter.js';
import { EventStream } from '../events/EventStream.js';
import { JsonlTraceWriter } from '../events/JsonlTraceWriter.js';
import { OpenAiCompatibleProvider } from '../model/OpenAiCompatibleProvider.js';
import type { LoadedSettings } from '../settings/loadSettings.js';
import { SessionTokenomics } from '../tokenomics/SessionTokenomics.js';

export interface CliSessionInput {
  loadedSettings: LoadedSettings;
  projectRoot: string;
  question: string;
  verbose: boolean;
}

export async function runCliSession(input: CliSessionInput): Promise<void> {
  const { settings, modelApiKey } = input.loadedSettings;
  const sessionId = createSessionId();
  const events = new EventStream(sessionId);
  const tokenomics = new SessionTokenomics();
  const traceWriter = await JsonlTraceWriter.open(
    join(input.projectRoot, settings.traces.directory),
    sessionId,
  );

  // Порядок важен: токеномика должна учесть ответ модели раньше,
  // чем придёт событие об окончании сессии.
  events.subscribe((event) => traceWriter.write(event));
  events.subscribe((event) => tokenomics.handleEvent(event));
  events.subscribe(createConsolePrinter({ verbose: input.verbose }));

  const provider = new OpenAiCompatibleProvider(settings.model, modelApiKey);
  const startedAt = performance.now();
  events.emit({
    type: 'session_started',
    providerName: settings.model.providerName,
    baseUrl: settings.model.baseUrl,
    model: settings.model.model,
  });

  try {
    await runSingleTurn(input.question, { provider, events, prices: settings.prices });
  } catch (error) {
    events.emit({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
  } finally {
    events.emit({
      type: 'session_finished',
      durationMs: Math.round(performance.now() - startedAt),
      ...tokenomics.summary(),
    });
    await traceWriter.close();
    console.log(`Трейс сессии: ${relative(input.projectRoot, traceWriter.filePath)}`);
  }
}

// Короткий идентификатор удобнее читать в консоли и в именах файлов.
function createSessionId(): string {
  return randomUUID().slice(0, 8);
}

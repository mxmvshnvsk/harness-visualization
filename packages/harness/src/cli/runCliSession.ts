// Собирает сессию: поток событий, подписчиков, провайдера, песочницу и тулы —
// и запускает один ход агента.

import { randomUUID } from 'node:crypto';
import { join, relative } from 'node:path';
import type { AgentDependencies } from '../agent/agentDependencies.js';
import { runAgentTurn } from '../agent/runAgentTurn.js';
import { createConsolePrinter } from '../events/createConsolePrinter.js';
import { EventStream } from '../events/EventStream.js';
import { JsonlTraceWriter } from '../events/JsonlTraceWriter.js';
import type { ReasoningEffort } from '../model/chatTypes.js';
import { OpenAiCompatibleProvider } from '../model/OpenAiCompatibleProvider.js';
import type { LoadedSettings } from '../settings/loadSettings.js';
import { SessionTokenomics } from '../tokenomics/SessionTokenomics.js';
import { createFileTools } from '../tools/fileTools/createFileTools.js';
import { ToolRegistry } from '../tools/ToolRegistry.js';
import { prepareWorkspace } from '../workspace/prepareWorkspace.js';
import { Workspace } from '../workspace/Workspace.js';

export interface CliSessionInput {
  loadedSettings: LoadedSettings;
  projectRoot: string;
  question: string;
  reasoningEffort: ReasoningEffort;
  // true — пересоздать рабочую папку из примеров (флаг --fresh).
  freshWorkspace: boolean;
  verbose: boolean;
}

export async function runCliSession(input: CliSessionInput): Promise<void> {
  const { settings } = input.loadedSettings;
  const events = new EventStream(createSessionId());
  const tokenomics = new SessionTokenomics();
  const traceWriter = await JsonlTraceWriter.open(
    join(input.projectRoot, settings.traces.directory),
    events.sessionId,
  );

  // Порядок важен: токеномика должна учесть ответ модели раньше,
  // чем придёт событие об окончании сессии.
  events.subscribe((event) => traceWriter.write(event));
  events.subscribe((event) => tokenomics.handleEvent(event));
  events.subscribe(createConsolePrinter({ verbose: input.verbose }));

  const workspaceDirectory = join(input.projectRoot, settings.workspace.directory);
  const preparedWorkspace = await prepareWorkspace({
    projectRoot: input.projectRoot,
    workspaceDirectory,
    seedDirectory: join(input.projectRoot, settings.workspace.seedDirectory),
    reset: input.freshWorkspace,
  });
  const dependencies = createAgentDependencies(input, events, workspaceDirectory);
  const startedAt = performance.now();
  events.emit({
    type: 'session_started',
    providerName: settings.model.providerName,
    baseUrl: settings.model.baseUrl,
    model: settings.model.model,
    reasoningEffort: input.reasoningEffort,
  });
  events.emit({
    type: 'workspace_prepared',
    directory: settings.workspace.directory,
    createdFromSeed: preparedWorkspace.createdFromSeed,
    wasReset: preparedWorkspace.wasReset,
  });

  try {
    await runAgentTurn(input.question, dependencies, {
      reasoningEffort: input.reasoningEffort,
      maxIterations: settings.agent.maxIterations,
    });
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

function createAgentDependencies(
  input: CliSessionInput,
  events: EventStream,
  workspaceDirectory: string,
): AgentDependencies {
  const { settings, modelApiKey } = input.loadedSettings;
  const tools = new ToolRegistry();
  for (const tool of createFileTools()) {
    tools.register(tool);
  }

  return {
    provider: new OpenAiCompatibleProvider(settings.model, modelApiKey),
    events,
    prices: settings.prices,
    tools,
    toolContext: { workspace: new Workspace(workspaceDirectory) },
  };
}

// Короткий идентификатор удобнее читать в консоли и в именах файлов.
function createSessionId(): string {
  return randomUUID().slice(0, 8);
}

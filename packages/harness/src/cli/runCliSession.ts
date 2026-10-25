// Собирает сессию: поток событий, подписчиков, провайдера, песочницу и тулы —
// и запускает один ход агента.

import { join } from 'node:path';
import type { AgentDependencies } from '../agent/agentDependencies.js';
import { runAgentTurn } from '../agent/runAgentTurn.js';
import type { EventStream } from '../events/EventStream.js';
import {
  closeMcpServers,
  connectMcpServers,
  type ConnectedMcpServers,
} from '../mcp/connectMcpServers.js';
import type { ReasoningEffort } from '../model/chatTypes.js';
import { OpenAiCompatibleProvider } from '../model/OpenAiCompatibleProvider.js';
import { NetworkRouter, type RoutedFetch } from '../network/NetworkRouter.js';
import { readProxyUrl } from '../network/proxyFromEnvironment.js';
import type { LoadedSettings } from '../settings/loadSettings.js';
import type {
  RetrievalMode,
  SearchProviderName,
  SearchSettings,
} from '../settings/settingsSchema.js';
import { createSearchProvider } from '../search/createSearchProvider.js';
import type { SearchProvider } from '../search/searchProvider.js';
import { createFileTools } from '../tools/fileTools/createFileTools.js';
import { createWebTools, type WebToolsOptions } from '../tools/webTools/createWebTools.js';
import { ToolRegistry } from '../tools/ToolRegistry.js';
import { prepareWorkspace } from '../workspace/prepareWorkspace.js';
import { Workspace } from '../workspace/Workspace.js';
import { announceSession } from './announceSession.js';
import { askConfirmation } from './askConfirmation.js';
import { startSessionRecording } from './sessionRecording.js';

export interface CliSessionInput {
  loadedSettings: LoadedSettings;
  projectRoot: string;
  question: string;
  reasoningEffort: ReasoningEffort;
  // null — провайдер поиска из harness.config.json, иначе выбранный флагом --search.
  searchProvider: SearchProviderName | null;
  // Кто ищет в базе знаний: модель (tool) или харнесс до запроса (auto).
  retrievalMode: RetrievalMode;
  // true — пересоздать рабочую папку из примеров (флаг --fresh).
  freshWorkspace: boolean;
  verbose: boolean;
}

export async function runCliSession(input: CliSessionInput): Promise<void> {
  const { settings } = input.loadedSettings;
  const recording = await startSessionRecording({
    projectRoot: input.projectRoot,
    tracesDirectory: settings.traces.directory,
    verbose: input.verbose,
  });
  const { events } = recording;
  const network = new NetworkRouter({
    settings: settings.network,
    proxyUrl: readProxyUrl(),
    onRequest: (request) => events.emit({ type: 'network_request', ...request }),
  });

  const workspaceDirectory = join(input.projectRoot, settings.workspace.directory);
  const preparedWorkspace = await prepareWorkspace({
    projectRoot: input.projectRoot,
    workspaceDirectory,
    seedDirectory: join(input.projectRoot, settings.workspace.seedDirectory),
    reset: input.freshWorkspace,
  });
  const searchProvider = await prepareSearchProvider(input, network.fetch);
  announceSession(events, {
    settings,
    reasoningEffort: input.reasoningEffort,
    workspaceDirectory: settings.workspace.directory,
    preparedWorkspace,
    searchProviderName: searchProvider?.name ?? null,
    retrievalMode: input.retrievalMode,
  });
  const mcpServers = await connectMcpServers(settings.mcpServers, {
    projectRoot: input.projectRoot,
    events,
  });
  const dependencies = createAgentDependencies(input, events, {
    workspaceDirectory,
    searchProvider,
    mcpServers,
    fetchImpl: network.fetch,
  });

  try {
    await runAgentTurn(input.question, dependencies, {
      reasoningEffort: input.reasoningEffort,
      maxIterations: settings.agent.maxIterations,
      retrieval:
        input.retrievalMode === 'auto'
          ? { toolName: settings.retrieval.toolName, limit: settings.retrieval.limit }
          : null,
    });
  } catch (error) {
    events.emit({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
  } finally {
    await closeMcpServers(mcpServers.connections, events);
    await network.close();
    await recording.finish();
  }
}

async function prepareSearchProvider(
  input: CliSessionInput,
  fetchImpl: RoutedFetch,
): Promise<SearchProvider | null> {
  const { settings } = input.loadedSettings;
  const searchSetup = await createSearchProvider(settings.search, input.searchProvider, fetchImpl);
  if (searchSetup.provider === null) {
    console.log(
      `Веб-поиск выключен: ${searchSetup.disabledReason}. Тул web_search не зарегистрирован.`,
    );
  }
  return searchSetup.provider;
}

interface SessionResources {
  workspaceDirectory: string;
  // null — веб-поиск выключен.
  searchProvider: SearchProvider | null;
  mcpServers: ConnectedMcpServers;
  // fetch с маршрутами из раздела network: им ходят модель, поиск и загрузка страниц.
  fetchImpl: RoutedFetch;
}

function createAgentDependencies(
  input: CliSessionInput,
  events: EventStream,
  resources: SessionResources,
): AgentDependencies {
  const { settings, modelApiKey } = input.loadedSettings;
  const webTools = createWebTools({
    webFetch: settings.webFetch,
    search: createSearchOption(resources.searchProvider, settings.search),
    loadPage: null,
    fetchImpl: resources.fetchImpl,
  });
  const tools = new ToolRegistry();
  for (const tool of [...createFileTools(), ...webTools, ...resources.mcpServers.tools]) {
    tools.register(tool);
  }

  return {
    provider: new OpenAiCompatibleProvider(settings.model, modelApiKey, resources.fetchImpl),
    events,
    prices: settings.prices,
    tools,
    toolContext: { workspace: new Workspace(resources.workspaceDirectory) },
    confirmAction: askConfirmation,
    permissionPolicy: settings.permissions,
    mcpServerInstructions: resources.mcpServers.instructions,
  };
}

function createSearchOption(
  provider: SearchProvider | null,
  searchSettings: SearchSettings | undefined,
): WebToolsOptions['search'] {
  if (provider === null || searchSettings === undefined) {
    return null;
  }
  return { provider, defaultMaxResults: searchSettings.defaultMaxResults };
}

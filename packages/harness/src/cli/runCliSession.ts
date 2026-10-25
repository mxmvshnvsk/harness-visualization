// Собирает сессию: поток событий, подписчиков, провайдера, песочницу и тулы —
// и запускает один ход агента.

import { join, resolve } from 'node:path';
import type { AgentDependencies } from '../agent/agentDependencies.js';
import type { RetrievalOptions } from '../agent/retrieveContext.js';
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
  // null — рабочая папка из harness.config.json; иначе своя папка сессии
  // (у pnpm compare-runs — временная, чтобы заметки одного прогона не влияли на другие).
  workspaceDirectory: string | null;
  verbose: boolean;
  // true — сессия без консоли (её запускает pnpm compare-runs): события пишутся только в трейс,
  // а действия, требующие разрешения, запрещаются — спросить некого.
  quiet: boolean;
}

export interface CliSessionResult {
  // Путь к трейсу от корня проекта.
  tracePath: string;
  // true — сессия прервалась ошибкой (событие error в трейсе).
  failed: boolean;
}

export async function runCliSession(input: CliSessionInput): Promise<CliSessionResult> {
  const { settings } = input.loadedSettings;
  const recording = await startSessionRecording({
    projectRoot: input.projectRoot,
    tracesDirectory: settings.traces.directory,
    verbose: input.verbose,
    quiet: input.quiet,
  });
  const { events } = recording;
  const network = new NetworkRouter({
    settings: settings.network,
    proxyUrl: readProxyUrl(),
    onRequest: (request) => events.emit({ type: 'network_request', ...request }),
  });

  const workspaceSetting = input.workspaceDirectory ?? settings.workspace.directory;
  const workspaceDirectory = resolve(input.projectRoot, workspaceSetting);
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
    workspaceDirectory: workspaceSetting,
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

  let failed = false;
  try {
    await runAgentTurn(input.question, dependencies, {
      reasoningEffort: input.reasoningEffort,
      maxIterations: settings.agent.maxIterations,
      retrieval: createRetrievalOptions(input),
    });
  } catch (error) {
    events.emit({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    failed = true;
  } finally {
    await closeMcpServers(mcpServers.connections, events);
    await network.close();
  }
  const tracePath = await recording.finish();
  return { tracePath, failed };
}

async function prepareSearchProvider(
  input: CliSessionInput,
  fetchImpl: RoutedFetch,
): Promise<SearchProvider | null> {
  const { settings } = input.loadedSettings;
  const searchSetup = await createSearchProvider(settings.search, input.searchProvider, fetchImpl);
  if (searchSetup.provider === null && !input.quiet) {
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
    confirmAction: input.quiet ? denyWithoutAsking : askConfirmation,
    permissionPolicy: settings.permissions,
    mcpServerInstructions: resources.mcpServers.instructions,
  };
}

// null — модель ищет сама; иначе харнесс ищет до запроса тулом из раздела retrieval.
function createRetrievalOptions(input: CliSessionInput): RetrievalOptions | null {
  if (input.retrievalMode !== 'auto') {
    return null;
  }
  const { retrieval } = input.loadedSettings.settings;
  return { toolName: retrieval.toolName, limit: retrieval.limit };
}

// В тихой сессии спросить некого, а молчание — не согласие.
function denyWithoutAsking(): Promise<boolean> {
  return Promise.resolve(false);
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

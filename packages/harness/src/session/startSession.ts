// Сессия харнесса: поток событий с записью в трейс, сеть, песочница, поиск, MCP-серверы,
// тулы — и один ход агента. Ничего не знает о том, кто её запустил и как показывает события:
// консоль у CLI, поток в браузер у сервера. Это передаётся снаружи через SessionHooks.
//
// startSession возвращает id сессии и поток событий сразу, а завершение — отдельно
// (completion): серверу нужно ответить на запрос о запуске, не дожидаясь конца сессии.

import { join, resolve } from 'node:path';
import type { AgentDependencies, ConfirmAction } from '../agent/agentDependencies.js';
import type { RetrievalOptions } from '../agent/retrieveContext.js';
import { runAgentTurn } from '../agent/runAgentTurn.js';
import type { EventListener, EventStream } from '../events/EventStream.js';
import {
  closeMcpServers,
  connectMcpServers,
  type ConnectedMcpServers,
} from '../mcp/connectMcpServers.js';
import type { ChatMessage, ReasoningEffort } from '../model/chatTypes.js';
import { OpenAiCompatibleProvider } from '../model/OpenAiCompatibleProvider.js';
import { NetworkRouter, type RoutedFetch } from '../network/NetworkRouter.js';
import { readProxyUrl } from '../network/proxyFromEnvironment.js';
import type { LoadedSettings } from '../settings/loadSettings.js';
import type { BudgetSettings } from '../context/promptBudget.js';
import type {
  ContextSettings,
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
import { startSessionRecording, type SessionRecording } from './sessionRecording.js';

export interface SessionInput {
  loadedSettings: LoadedSettings;
  projectRoot: string;
  question: string;
  reasoningEffort: ReasoningEffort;
  // null — провайдер поиска из harness.config.json, иначе выбранный явно (флаг --search).
  searchProvider: SearchProviderName | null;
  // Кто ищет в базе знаний: модель (tool) или харнесс до запроса — словами пользователя (auto)
  // или запросом, который сформулировала модель (rewrite).
  retrievalMode: RetrievalMode;
  // null — тул поиска харнесса из harness.config.json; иначе другой (флаг --retrieval-tool).
  retrievalToolName: string | null;
  // true — пересоздать рабочую папку из примеров (флаг --fresh).
  freshWorkspace: boolean;
  // null — рабочая папка из harness.config.json; иначе своя папка сессии
  // (у pnpm compare-runs — временная, чтобы заметки одного прогона не влияли на другие).
  workspaceDirectory: string | null;
}

// То, что зависит от того, кто запустил сессию.
export interface SessionHooks {
  // Как спросить разрешение на действие: в терминале, в браузере или запретить без вопроса.
  confirmAction: ConfirmAction;
  // Подписчики событий с самого первого: консоль, поток в браузер.
  listeners: EventListener[];
  // Служебные сообщения, которых нет в событиях (например, почему выключен веб-поиск).
  log: (message: string) => void;
  // Следующий вопрос того же диалога; null — закончить сессию. Нет функции — сессия из одного
  // вопроса (pnpm compare-runs, запуск без терминала): спросить некого.
  nextQuestion?: (turn: number) => Promise<string | null>;
}

export interface SessionResult {
  // Путь к трейсу от корня проекта.
  tracePath: string;
  // true — сессия прервалась ошибкой (событие error в трейсе).
  failed: boolean;
}

export interface StartedSession {
  sessionId: string;
  events: EventStream;
  completion: Promise<SessionResult>;
}

export async function startSession(
  input: SessionInput,
  hooks: SessionHooks,
): Promise<StartedSession> {
  const recording = await startSessionRecording({
    projectRoot: input.projectRoot,
    tracesDirectory: input.loadedSettings.settings.traces.directory,
    listeners: hooks.listeners,
  });
  return {
    sessionId: recording.events.sessionId,
    events: recording.events,
    completion: runRecordedSession(input, hooks, recording),
  };
}

// Любая ошибка — и до хода агента (песочница, MCP), и во время — попадает в трейс событием
// error, а трейс закрывается: сессия всегда заканчивается записью, а не обрывом.
async function runRecordedSession(
  input: SessionInput,
  hooks: SessionHooks,
  recording: SessionRecording,
): Promise<SessionResult> {
  const { events } = recording;
  const { settings } = input.loadedSettings;
  const network = new NetworkRouter({
    settings: settings.network,
    proxyUrl: readProxyUrl(),
    onRequest: (request) => events.emit({ type: 'network_request', ...request }),
  });
  let mcpServers: ConnectedMcpServers | null = null;
  let failed = false;
  try {
    const prepared = await prepareSession(input, hooks, events, network.fetch);
    mcpServers = prepared.mcpServers;
    await runDialog(input, hooks, prepared.dependencies);
  } catch (error) {
    events.emit({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    failed = true;
  } finally {
    if (mcpServers !== null) {
      await closeMcpServers(mcpServers.connections, events);
    }
    await network.close();
  }
  return { tracePath: await recording.finish(), failed };
}

// Диалог: ход за ходом, пока есть следующий вопрос. История общая для всех ходов.
async function runDialog(
  input: SessionInput,
  hooks: SessionHooks,
  dependencies: AgentDependencies,
): Promise<void> {
  const options = {
    reasoningEffort: input.reasoningEffort,
    maxIterations: input.loadedSettings.settings.agent.maxIterations,
    retrieval: createRetrievalOptions(input),
  };
  const conversation: ChatMessage[] = [];
  let question: string | null = input.question;
  for (let turn = 1; question !== null; turn += 1) {
    await runAgentTurn(question, dependencies, options, conversation);
    if (hooks.nextQuestion === undefined) {
      return;
    }
    dependencies.events.emit({ type: 'awaiting_question', turn });
    question = await hooks.nextQuestion(turn);
  }
}

interface PreparedSession {
  dependencies: AgentDependencies;
  mcpServers: ConnectedMcpServers;
}

async function prepareSession(
  input: SessionInput,
  hooks: SessionHooks,
  events: EventStream,
  fetchImpl: RoutedFetch,
): Promise<PreparedSession> {
  const { settings } = input.loadedSettings;
  const workspaceSetting = input.workspaceDirectory ?? settings.workspace.directory;
  const workspaceDirectory = resolve(input.projectRoot, workspaceSetting);
  const preparedWorkspace = await prepareWorkspace({
    projectRoot: input.projectRoot,
    workspaceDirectory,
    seedDirectory: join(input.projectRoot, settings.workspace.seedDirectory),
    reset: input.freshWorkspace,
  });
  const searchProvider = await prepareSearchProvider(input, hooks, fetchImpl);
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
  const dependencies = createAgentDependencies(input, hooks, events, {
    workspaceDirectory,
    searchProvider,
    mcpServers,
    fetchImpl,
  });
  return { dependencies, mcpServers };
}

async function prepareSearchProvider(
  input: SessionInput,
  hooks: SessionHooks,
  fetchImpl: RoutedFetch,
): Promise<SearchProvider | null> {
  const { settings } = input.loadedSettings;
  const searchSetup = await createSearchProvider(settings.search, input.searchProvider, fetchImpl);
  if (searchSetup.provider === null) {
    hooks.log(
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
  input: SessionInput,
  hooks: SessionHooks,
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
  const harnessOnlyTools = new ToolRegistry();
  for (const tool of resources.mcpServers.harnessOnlyTools) {
    harnessOnlyTools.register(tool);
  }

  return {
    provider: new OpenAiCompatibleProvider(settings.model, modelApiKey, resources.fetchImpl),
    events,
    prices: settings.prices,
    tools,
    harnessOnlyTools,
    toolContext: { workspace: new Workspace(resources.workspaceDirectory) },
    confirmAction: hooks.confirmAction,
    permissionPolicy: settings.permissions,
    mcpServerInstructions: resources.mcpServers.instructions,
    budget: budgetSettings(settings.context),
  };
}

function budgetSettings(context: ContextSettings): BudgetSettings {
  return {
    preset: context.preset,
    limitTokens: context.limits[context.preset],
    toolResultMaxTokens: context.toolResultLimits[context.preset],
    thresholdPercent: context.thresholdPercent,
    charsPerToken: context.charsPerToken,
  };
}

// null — модель ищет сама; иначе харнесс ищет до запроса тулом из раздела retrieval.
function createRetrievalOptions(input: SessionInput): RetrievalOptions | null {
  if (input.retrievalMode === 'tool') {
    return null;
  }
  const { retrieval } = input.loadedSettings.settings;
  return {
    toolName: input.retrievalToolName ?? retrieval.toolName,
    limit: retrieval.limit,
    rewriteQuery: input.retrievalMode === 'rewrite',
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

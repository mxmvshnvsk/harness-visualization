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
import type { DeltaListener, EventListener, EventStream } from '../events/EventStream.js';
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
import type { SessionMemory } from '../agent/agentDependencies.js';
import { createMemoryTool } from '../memory/createMemoryTool.js';
import { MemoryStore } from '../memory/MemoryStore.js';
import { MEMO_PATH, MEMORY_DIRECTORY } from '../memory/memoryPaths.js';
import { createProgressTool } from '../progress/createProgressTool.js';
import { ProgressTracker } from '../progress/ProgressTracker.js';
import { createSkillTools } from '../skills/createSkillTools.js';
import { createDelegateTool } from '../subagents/createDelegateTool.js';
import { loadSkills } from '../skills/loadSkills.js';
import { SkillLibrary } from '../skills/SkillLibrary.js';
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
  // Дать ли модели субагентов (этап 6c); null — как в harness.config.json (subagents.enabled).
  subagents: boolean | null;
  // false — сессия без демо-проекта: без «Кедр Софт», MCP, поиска в базе, скиллов, памяти,
  // плана и субагентов; своя пустая песочница, тулы файлов и веба.
  demoProject: boolean;
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
  // Кусочки ответа модели вживую — для браузера (этап 8d.2); в трейс не пишутся.
  deltaListeners?: DeltaListener[];
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
    deltaListeners: hooks.deltaListeners ?? [],
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
  const { workspaceSetting, preparedWorkspace } = await prepareSessionWorkspace(input);
  const searchProvider = await prepareSearchProvider(input, hooks, fetchImpl);
  announceSession(events, {
    settings,
    reasoningEffort: input.reasoningEffort,
    workspaceDirectory: workspaceSetting,
    preparedWorkspace,
    searchProviderName: searchProvider?.name ?? null,
    retrievalMode: input.demoProject ? input.retrievalMode : 'tool',
    subagents: subagentsOf(input),
    demoProject: input.demoProject,
  });
  const workspace = new Workspace(resolve(input.projectRoot, workspaceSetting));
  const skills = await prepareSkills(input, events);
  const memory = await prepareMemory(workspace, events, input.demoProject);
  // План прошлой сессии — не план этой: харнесс убирает progress.md до первого шага.
  const progress = new ProgressTracker(workspace, events);
  await progress.reset();
  // Без демо-проекта MCP-серверы не запускаются: база знаний «Кедр Софт» — часть демо.
  const mcpServers = await connectMcpServers(input.demoProject ? settings.mcpServers : [], {
    projectRoot: input.projectRoot,
    events,
  });
  const dependencies = createAgentDependencies(input, hooks, events, {
    workspace,
    searchProvider,
    mcpServers,
    fetchImpl,
    skills,
    memory,
    progress,
  });
  return { dependencies, mcpServers };
}

// Песочница: у демо-проекта — из примеров «Кедр Софт», без него — своя, в начале пустая.
async function prepareSessionWorkspace(input: SessionInput) {
  const { workspace } = input.loadedSettings.settings;
  const workspaceSetting =
    input.workspaceDirectory ??
    (input.demoProject ? workspace.directory : workspace.blankDirectory);
  const preparedWorkspace = await prepareWorkspace({
    projectRoot: input.projectRoot,
    workspaceDirectory: resolve(input.projectRoot, workspaceSetting),
    seedDirectory: input.demoProject ? join(input.projectRoot, workspace.seedDirectory) : null,
    reset: input.freshWorkspace,
  });
  return { workspaceSetting, preparedWorkspace };
}

// Каталог скиллов — событием skill_catalog; скиллы always загружаются сразу: их инструкции
// будут в system prompt с первого запроса. Без демо-проекта скиллов нет: они про «Кедр Софт».
async function prepareSkills(input: SessionInput, events: EventStream): Promise<SkillLibrary> {
  if (!input.demoProject) {
    return new SkillLibrary({ skills: [], problems: [] }, events);
  }
  const settings = input.loadedSettings.settings.skills;
  const catalog = await loadSkills(resolve(input.projectRoot, settings.directory), settings);
  events.emit({
    type: 'skill_catalog',
    directory: settings.directory,
    skills: catalog.skills.map((skill) => ({
      name: skill.name,
      description: skill.description,
      mode: skill.mode,
      files: skill.files,
      instructionCharacters: skill.instructions.length,
    })),
    problems: catalog.problems,
  });
  const library = new SkillLibrary(catalog, events);
  for (const skill of library.always()) {
    library.load(skill, 'always');
  }
  return library;
}

// memo.md на начало сессии — в system prompt; событие memory_loaded показывает, что было в памяти.
async function prepareMemory(
  workspace: Workspace,
  events: EventStream,
  demoProject: boolean,
): Promise<SessionMemory> {
  const store = new MemoryStore(workspace, events);
  // Без демо-проекта памяти нет: модель начинает без заметок прошлых сессий.
  if (!demoProject) {
    return { store, memoAtStart: null };
  }
  const memoAtStart = await store.readOrNull(MEMO_PATH);
  events.emit({
    type: 'memory_loaded',
    directory: MEMORY_DIRECTORY,
    memoPath: MEMO_PATH,
    memoCharacters: memoAtStart?.length ?? null,
    files: await store.files(),
  });
  return { store, memoAtStart };
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
  workspace: Workspace;
  // null — веб-поиск выключен.
  searchProvider: SearchProvider | null;
  mcpServers: ConnectedMcpServers;
  // fetch с маршрутами из раздела network: им ходят модель, поиск и загрузка страниц.
  fetchImpl: RoutedFetch;
  skills: SkillLibrary;
  memory: SessionMemory;
  progress: ProgressTracker;
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
  // Без демо-проекта — только песочница и веб: память, план и скиллы — часть демо.
  const ownTools = input.demoProject
    ? [
        ...createFileTools(),
        createMemoryTool(resources.memory.store),
        createProgressTool(resources.progress),
        ...createSkillTools(resources.skills),
        ...webTools,
      ]
    : [...createFileTools(), ...webTools];
  for (const tool of [...ownTools, ...resources.mcpServers.tools]) {
    tools.register(tool);
  }
  const harnessOnlyTools = new ToolRegistry();
  for (const tool of resources.mcpServers.harnessOnlyTools) {
    harnessOnlyTools.register(tool);
  }

  const provider = new OpenAiCompatibleProvider(settings.model, modelApiKey, resources.fetchImpl);
  const { compactionModel } = settings.context;
  const dependencies: AgentDependencies = {
    provider,
    compactionProvider:
      compactionModel === null
        ? provider
        : new OpenAiCompatibleProvider(
            { ...settings.model, model: compactionModel },
            modelApiKey,
            resources.fetchImpl,
          ),
    events,
    prices: settings.prices,
    tools,
    harnessOnlyTools,
    toolContext: { workspace: resources.workspace },
    confirmAction: hooks.confirmAction,
    permissionPolicy: settings.permissions,
    mcpServerInstructions: resources.mcpServers.instructions,
    skills: resources.skills,
    memory: resources.memory,
    progress: resources.progress,
    budget: budgetSettings(settings.context),
    parallelDelegation: settings.subagents.parallel,
    demoProject: input.demoProject,
  };
  registerDelegateTool(input, dependencies);
  return dependencies;
}

// Субагентам — тулы сессии, поэтому delegate_task регистрируется последним, и только если
// субагенты включены в этой сессии.
function registerDelegateTool(input: SessionInput, dependencies: AgentDependencies): void {
  if (subagentsOf(input) === null) {
    return;
  }
  const tool = createDelegateTool(input.loadedSettings.settings.subagents, () => dependencies);
  if (tool !== null) {
    dependencies.tools.register(tool);
  }
}

// Субагенты этой сессии: включены флагом или галочкой, иначе — как в настройках.
function subagentsOf(input: SessionInput): { agents: string[]; parallel: boolean } | null {
  if (!input.demoProject) {
    return null;
  }
  const settings = input.loadedSettings.settings.subagents;
  const agents = Object.keys(settings.agents);
  const enabled = input.subagents ?? settings.enabled;
  return enabled && agents.length > 0 ? { agents, parallel: settings.parallel } : null;
}

function budgetSettings(context: ContextSettings): BudgetSettings {
  return {
    preset: context.preset,
    limitTokens: context.limits[context.preset],
    toolResultMaxTokens: context.toolResultLimits[context.preset],
    thresholdPercent: context.thresholdPercent,
    clearTargetPercent: context.clearTargetPercent,
    charsPerToken: context.charsPerToken,
  };
}

// null — модель ищет сама; иначе харнесс ищет до запроса тулом из раздела retrieval.
function createRetrievalOptions(input: SessionInput): RetrievalOptions | null {
  // Без демо-проекта искать харнессу негде: базы знаний нет.
  if (input.retrievalMode === 'tool' || !input.demoProject) {
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

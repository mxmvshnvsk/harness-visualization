// Сессия харнесса: поток событий с записью в трейс, сеть, песочница, поиск, MCP-серверы,
// тулы — и один ход агента. Ничего не знает о том, кто её запустил и как показывает события:
// консоль у CLI, поток в браузер у сервера. Это передаётся снаружи через SessionHooks.
//
// startSession возвращает id сессии и поток событий сразу, а завершение — отдельно
// (completion): серверу нужно ответить на запрос о запуске, не дожидаясь конца сессии.

import { join, relative, resolve } from 'node:path';
import type { AgentDependencies, ConfirmAction } from '../agent/agentDependencies.js';
import type { RetrievalOptions } from '../agent/retrieveContext.js';
import { runAgentTurn } from '../agent/runAgentTurn.js';
import { runBranchTurn, type BranchStart } from '../branch/runBranchTurn.js';
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
  ContextPreset,
  ContextSettings,
  PermissionsSettings,
  RetrievalMode,
  SearchProviderName,
  SearchSettings,
} from '../settings/settingsSchema.js';
import { createSearchProvider } from '../search/createSearchProvider.js';
import type { SearchProvider } from '../search/searchProvider.js';
import { createFileTools } from '../tools/fileTools/createFileTools.js';
import { createWebTools, type WebToolsOptions } from '../tools/webTools/createWebTools.js';
import { ToolRegistry } from '../tools/ToolRegistry.js';
import type { Tool } from '../tools/toolTypes.js';
import type { SessionMemory } from '../agent/agentDependencies.js';
import { createMemoryTool } from '../memory/createMemoryTool.js';
import { MemoryStore } from '../memory/MemoryStore.js';
import { MEMO_PATH, MEMORY_DIRECTORY } from '../memory/memoryPaths.js';
import { createProgressTool } from '../progress/createProgressTool.js';
import { ProgressTracker } from '../progress/ProgressTracker.js';
import { createSkillTools } from '../skills/createSkillTools.js';
import { createDelegateTool } from '../subagents/createDelegateTool.js';
import { loadSkillCatalog } from '../skills/loadSkills.js';
import { SkillLibrary } from '../skills/SkillLibrary.js';
import { prepareWorkspace } from '../workspace/prepareWorkspace.js';
import { Workspace } from '../workspace/Workspace.js';
import { announceSession } from './announceSession.js';
import type { OrchestrationMode } from '../events/harnessEvents.js';
import { runPipelineTurn, type PipelineOptions } from '../orchestration/runPipelineTurn.js';
import { runSuperagentTurn, type SuperagentOptions } from '../orchestration/runSuperagentTurn.js';
import { runHybridTurn, type HybridOptions } from '../orchestration/runHybridTurn.js';
import { startSessionRecording, type SessionRecording } from './sessionRecording.js';
import { arenaRoot, describeArenaRun, type ArenaSessionInput } from '../arena/arenaSession.js';
import { checkAcceptance } from '../arena/checkAcceptance.js';
import { sandboxInfo } from '../arena/nodeSandbox.js';
import { createRunTestsTool } from '../arena/runTestsTool.js';
import { createRunNodeTool } from '../arena/runNodeTool.js';

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
  // Оркестрация (этап 6d): кто решает порядок шагов; null — обычный агент.
  orchestration: OrchestrationMode | null;
  // false — сессия без демо-проекта: без «Кедр Софт», MCP, поиска в базе, скиллов, памяти,
  // плана и субагентов; своя пустая песочница, тулы файлов и веба.
  demoProject: boolean;
  // null — рабочая папка из harness.config.json; иначе своя папка сессии
  // (у pnpm compare-runs — временная, чтобы заметки одного прогона не влияли на другие).
  // Сессия без демо-проекта получает свою подпапку сама — см. withOwnBlankWorkspace.
  workspaceDirectory: string | null;
  // Откуда скопировать файлы в новую папку сессии без демо-проекта; null — начать с пустой.
  // У ветки — папка исходной сессии: агент продолжает с тем, что уже написал.
  workspaceSeedDirectory?: string | null;
  // Ветка (этап 9): первый ход — не новый вопрос, а продолжение чужой записи с шага N.
  branch?: BranchStart | null;
  // Прогон Код-арены (этап 10): рабочая папка — копия проекта, после хода — приёмка.
  // Только вместе с demoProject: false — базы знаний у арены нет.
  arena?: ArenaSessionInput | null;
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
    const prepared = await prepareSession(
      withOwnBlankWorkspace(input, recording.name),
      hooks,
      events,
      network.fetch,
    );
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
    maxIterations: input.arena?.maxIterations ?? input.loadedSettings.settings.agent.maxIterations,
    retrieval: createRetrievalOptions(input),
  };
  const conversation: ChatMessage[] = [];
  const runTurn = turnRunner(input, options, conversation);
  let question: string | null = input.question;
  for (let turn = 1; question !== null; turn += 1) {
    const branch = turn === 1 ? (input.branch ?? null) : null;
    await (branch === null
      ? runTurn(question, dependencies)
      : runBranchTurn(branch, dependencies, options, conversation));
    await acceptArenaTurn(input, dependencies);
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
  // Песочница арены: у Docker версию Node узнаём у образа — до начала, чтобы ошибка «Docker
  // не запущен» пришла сразу, а не на первом run_tests.
  const sandbox = input.arena ? await sandboxInfo(settings.arena) : null;
  announceSession(events, {
    settings,
    reasoningEffort: input.reasoningEffort,
    workspaceDirectory: workspaceSetting,
    preparedWorkspace,
    searchProviderName: searchProvider?.name ?? null,
    retrievalMode: input.demoProject ? input.retrievalMode : 'tool',
    subagents: subagentsOf(input),
    orchestration: orchestrationOf(input),
    demoProject: input.demoProject,
    arena:
      input.arena && sandbox !== null
        ? describeArenaRun(input.arena, input.projectRoot, sandbox)
        : null,
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

// Сессия без демо-проекта работает в своей подпапке workspaces/blank/<имя трейса>: код,
// который написал агент, не перезапишет следующая сессия. Демо-песочница и арена — как были.
export function withOwnBlankWorkspace(input: SessionInput, sessionName: string): SessionInput {
  if (input.demoProject || input.arena || input.workspaceDirectory !== null) {
    return input;
  }
  const { blankDirectory } = input.loadedSettings.settings.workspace;
  return { ...input, workspaceDirectory: `${blankDirectory}/${sessionName}` };
}

// Песочница: у демо-проекта — из примеров «Кедр Софт», без него — своя: пустая или, у ветки,
// копия папки исходной сессии.
async function prepareSessionWorkspace(input: SessionInput) {
  const { workspace } = input.loadedSettings.settings;
  const arenaDirectory = input.arena ? relative(input.projectRoot, input.arena.directory) : null;
  const workspaceSetting =
    arenaDirectory ??
    input.workspaceDirectory ??
    (input.demoProject ? workspace.directory : workspace.blankDirectory);
  const preparedWorkspace = await prepareWorkspace({
    projectRoot: input.projectRoot,
    workspaceDirectory: resolve(input.projectRoot, workspaceSetting),
    seedDirectory: seedDirectoryOf(input),
    reset: input.freshWorkspace,
  });
  return { workspaceSetting, preparedWorkspace };
}

function seedDirectoryOf(input: SessionInput): string | null {
  if (input.demoProject) {
    return join(input.projectRoot, input.loadedSettings.settings.workspace.seedDirectory);
  }
  const seed = input.workspaceSeedDirectory ?? null;
  return seed === null ? null : resolve(input.projectRoot, seed);
}

// Каталог скиллов — событием skill_catalog; скиллы always загружаются сразу: их инструкции
// будут в system prompt с первого запроса. Без демо-проекта и в Код-арене — только свои скиллы
// из skills-custom/: скиллы проекта про «Кедр Софт».
async function prepareSkills(input: SessionInput, events: EventStream): Promise<SkillLibrary> {
  const settings = input.loadedSettings.settings.skills;
  const catalog = await loadSkillCatalog(input.projectRoot, settings, input.demoProject);
  // Без демо-проекта и без своих скиллов каталога нет вовсе — как до skills-custom.
  if (!input.demoProject && catalog.skills.length === 0 && catalog.problems.length === 0) {
    return new SkillLibrary(catalog, events);
  }
  events.emit({
    type: 'skill_catalog',
    directory: settings.directory,
    customDirectory: settings.customDirectory,
    skills: catalog.skills.map((skill) => ({
      name: skill.name,
      description: skill.description,
      mode: skill.mode,
      files: skill.files,
      instructionCharacters: skill.instructions.length,
      origin: skill.origin,
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
  const ownTools = ownToolsOf(input, resources, webTools);
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
    permissionPolicy: arenaPolicy(input, settings.permissions),
    mcpServerInstructions: resources.mcpServers.instructions,
    skills: resources.skills,
    memory: resources.memory,
    progress: resources.progress,
    budget: budgetSettings(settings.context, input.arena?.contextPreset ?? null),
    parallelDelegation: settings.subagents.parallel,
    demoProject: input.demoProject,
    arena: arenaModeOf(input),
  };
  registerDelegateTool(input, dependencies);
  return dependencies;
}

// Свои тулы харнесса. Без демо-проекта — только песочница и веб: память, план и скиллы —
// часть демо. Арене (этап 10) веб не нужен: файлы проекта и, если не «вслепую», запуск тестов.
function ownToolsOf(input: SessionInput, resources: SessionResources, webTools: Tool[]): Tool[] {
  if (input.arena) {
    const { arena } = input.loadedSettings.settings;
    return [
      ...createFileTools(),
      ...(input.arena.runTests ? [createRunTestsTool(arena)] : []),
      ...(input.arena.runNode ? [createRunNodeTool(arena)] : []),
      ...createSkillTools(resources.skills),
    ];
  }
  if (!input.demoProject) {
    return [...createFileTools(), ...webTools, ...createSkillTools(resources.skills)];
  }
  return [
    ...createFileTools(),
    createMemoryTool(resources.memory.store),
    createProgressTool(resources.progress),
    ...createSkillTools(resources.skills),
    ...webTools,
  ];
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

type TurnRunner = (question: string, dependencies: AgentDependencies) => Promise<string>;

// Кто ведёт ход: обычный агент, пайплайн (каждый вопрос — заново по тем же шагам, истории нет)
// или оркестратор-суперагент (своя история диалога, как у агента).
function turnRunner(
  input: SessionInput,
  options: Parameters<typeof runAgentTurn>[2],
  conversation: ChatMessage[],
): TurnRunner {
  const pipeline = pipelineOf(input);
  if (pipeline !== null) {
    return (question, dependencies) => runPipelineTurn(question, dependencies, pipeline);
  }
  const hybrid = hybridOf(input);
  if (hybrid !== null) {
    return (question, dependencies) => runHybridTurn(question, dependencies, hybrid);
  }
  const superagent = superagentOf(input);
  if (superagent !== null) {
    return (question, dependencies) =>
      runSuperagentTurn(question, dependencies, superagent, conversation);
  }
  return (question, dependencies) => runAgentTurn(question, dependencies, options, conversation);
}

function hybridOf(input: SessionInput): HybridOptions | null {
  if (orchestrationOf(input) !== 'hybrid') {
    return null;
  }
  const { orchestration, subagents } = input.loadedSettings.settings;
  return {
    settings: orchestration.hybrid,
    superagent: orchestration.superagent,
    subagents,
    reasoningEffort: input.reasoningEffort,
  };
}

function superagentOf(input: SessionInput): SuperagentOptions | null {
  if (orchestrationOf(input) !== 'superagent') {
    return null;
  }
  const { orchestration, subagents } = input.loadedSettings.settings;
  return {
    settings: orchestration.superagent,
    subagents,
    reasoningEffort: input.reasoningEffort,
    maxIterations: orchestration.superagent.maxIterations,
  };
}

// Оркестрация — только в демо-проекте: исследователи читают базу знаний «Кедр Софт».
function orchestrationOf(input: SessionInput): OrchestrationMode | null {
  return input.demoProject ? input.orchestration : null;
}

// Настройки пайплайна (этап 6d): исследователь — из описанных субагентов, поиск — тул харнесса.
function pipelineOf(input: SessionInput): PipelineOptions | null {
  if (orchestrationOf(input) !== 'pipeline') {
    return null;
  }
  const { orchestration, subagents, retrieval } = input.loadedSettings.settings;
  const researcher = subagents.agents[orchestration.pipeline.researcher];
  if (researcher === undefined) {
    throw new Error(
      `Для пайплайна нужен субагент «${orchestration.pipeline.researcher}» в subagents.agents ` +
        '(orchestration.pipeline.researcher в harness.config.json).',
    );
  }
  return {
    settings: orchestration.pipeline,
    researcher,
    searchTool: input.retrievalToolName ?? orchestration.pipeline.searchTool ?? retrieval.toolName,
    reasoningEffort: input.reasoningEffort,
  };
}

// Субагенты этой сессии: включены флагом или галочкой, иначе — как в настройках.
// В оркестрации поручения даёт не модель тулом, а код или оркестратор — delegate_task не нужен.
function subagentsOf(input: SessionInput): { agents: string[]; parallel: boolean } | null {
  if (!input.demoProject || orchestrationOf(input) !== null) {
    return null;
  }
  const settings = input.loadedSettings.settings.subagents;
  const agents = Object.keys(settings.agents);
  const enabled = input.subagents ?? settings.enabled;
  return enabled && agents.length > 0 ? { agents, parallel: settings.parallel } : null;
}

function arenaModeOf(input: SessionInput): 'task' | 'free' | null {
  if (!input.arena) {
    return null;
  }
  return input.arena.task === null ? 'free' : 'task';
}

// run_node — код модели на машине пользователя: по умолчанию каждый запуск спрашиваем.
// Явное решение для run_node в permissions.tools harness.config.json главнее.
function arenaPolicy(input: SessionInput, permissions: PermissionsSettings): PermissionsSettings {
  if (!input.arena?.runNode) {
    return permissions;
  }
  return { ...permissions, tools: { run_node: 'ask', ...permissions.tools } };
}

// Приёмка после хода (этап 10): агент ответил — харнесс сам гоняет видимые и скрытые тесты.
// У свободного режима скрытых тестов нет: принимает пользователь.
async function acceptArenaTurn(
  input: SessionInput,
  dependencies: AgentDependencies,
): Promise<void> {
  const task = input.arena?.task ?? null;
  if (!input.arena || task === null) {
    return;
  }
  const { arena } = input.loadedSettings.settings;
  dependencies.events.emit(
    await checkAcceptance({
      arenaRoot: arenaRoot(input.projectRoot, arena),
      task,
      directory: input.arena.directory,
      originalTests: input.arena.originalTests,
      originalFiles: input.arena.originalFiles,
      settings: arena,
    }),
  );
}

// preset — свой у прогона арены; null — из раздела context.
function budgetSettings(
  context: ContextSettings,
  presetOverride: ContextPreset | null,
): BudgetSettings {
  const preset = presetOverride ?? context.preset;
  return {
    preset,
    limitTokens: context.limits[preset],
    toolResultMaxTokens: context.toolResultLimits[preset],
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

// Типы событий харнесса — это и есть формат трейса.
// Каждое событие — одна строка JSONL; подробное описание в docs/events.md.

import type {
  ChatMessage,
  ModelReply,
  ReasoningEffort,
  ResponseTiming,
  TokenUsage,
} from '../model/chatTypes.js';
import type {
  ActionTarget,
  PermissionAnswerSource,
  PermissionCheck,
  PermissionDecision,
  ToolEffect,
} from '../permissions/permissionTypes.js';
import type { NetworkRequestInfo } from '../network/NetworkRouter.js';
import type { PromptBudget } from '../context/promptBudget.js';
import type { RetrievalMode } from '../settings/settingsSchema.js';
import type { RestoredContext } from '../context/restoreAfterCompaction.js';
import type { MemoryCommand } from '../memory/MemoryStore.js';
import type { StepStatus } from '../progress/ProgressTracker.js';
import type { SkillMode, SkillProblem, SkillTrigger } from '../skills/skillTypes.js';
import type {
  RequestCost,
  SessionCost,
  ToolCallCost,
  ToolCostTotal,
} from '../tokenomics/costTypes.js';

export interface EventMetadata {
  // Порядковый номер в сессии, начиная с 1.
  sequence: number;
  sessionId: string;
  // Время в формате ISO 8601, UTC.
  timestamp: string;
  // Чьё это событие: субагента (этап 6c) — его id из subagent_started. Нет поля — главного агента;
  // в трейсах до 6c поля нет нигде.
  agentId?: string;
}

export interface SessionStartedPayload {
  type: 'session_started';
  providerName: string;
  baseUrl: string;
  model: string;
  reasoningEffort: ReasoningEffort;
  // Прокси для запросов с маршрутом proxy (из окружения, секреты скрыты); null — прокси не задан,
  // все запросы идут напрямую. Маршрут каждого запроса — в событиях network_request.
  networkProxy: string | null;
  // Какой поисковый провайдер у тула web_search; null — поиск выключен.
  searchProvider: string | null;
  // tool — модель ищет в базе знаний сама; auto — харнесс подмешивает найденное до запроса.
  retrievalMode: RetrievalMode;
  // Субагенты сессии (этап 6c): кому модель может поручать задачи; null — выключены.
  // В трейсах до этого поля нет — субагентов там не было.
  subagents?: { agents: string[]; parallel: boolean } | null;
  // Оркестрация (этап 6d); null или нет поля — обычный агент.
  orchestration?: OrchestrationMode | null;
  // false — сессия без демо-проекта: без «Кедр Софт» в system prompt, MCP, поиска в базе,
  // скиллов и памяти, с пустой песочницей. Нет поля — демо-проект (трейсы до этого режима).
  demoProject?: boolean;
  // Трейс переведён адаптером из записи чужого харнесса (этап 9.4): что это за харнесс
  // и чего в его записи нет; нет поля — запись нашего харнесса.
  importedFrom?: ImportedFrom | null;
  // Прогон Код-арены (этап 10); нет поля — обычная сессия.
  arena?: ArenaRun | null;
}

// Прогон Код-арены (этап 10): задача, копия проекта и чем ограничен запуск кода.
export interface ArenaRun {
  // null — свободный режим, без заготовленной задачи.
  taskId: string | null;
  // Проект свободного режима (этап 10.4); нет поля или null — задача «Кедр Софт».
  project?: string | null;
  // Папка копии от корня проекта.
  directory: string;
  // false — режим «вслепую»: тула run_tests у модели нет.
  runTests: boolean;
  // Был ли у модели run_node (этап 10.4); нет поля — трейсы до него, тула не было.
  runNode?: boolean;
  // Пресет контекста и лимит шагов прогона: у арены свои (по умолчанию real и 25).
  contextPreset: 'demo' | 'stress' | 'real';
  maxIterations: number;
  // Закрыта ли сеть для запускаемого кода: модель разрешений Node закрывает её с Node 25,
  // Docker — всегда.
  network: 'closed' | 'open';
  // Версия Node песочницы: у Docker — из образа.
  nodeVersion: string;
  // Где запускался код агента; нет поля — трейсы до Docker-песочницы, это node.
  sandbox?: 'node' | 'docker';
  // Образ Docker.
  image?: string;
}

export interface ImportedFrom {
  // Например, «Claude Code».
  harness: string;
  version: string | null;
  // Чего в чужой записи нет или что адаптер пропустил: интерфейс показывает это, а не пустоту.
  missing: string[];
  // Claude Code 2.1: сколько субагентов поручено, а их записей (subagents/agent-<id>.jsonl)
  // среди открытых файлов нет — интерфейс предложит их добавить.
  subagentsWithoutRecord?: number;
}

export interface WorkspacePreparedPayload {
  type: 'workspace_prepared';
  // Папка песочницы относительно корня проекта.
  directory: string;
  // true — папка создана только что из примеров.
  createdFromSeed: boolean;
  // true — прежняя папка удалена по флагу --fresh.
  wasReset: boolean;
}

export interface McpServerStartingPayload {
  type: 'mcp_server_starting';
  serverName: string;
  command: string;
  args: string[];
  trustAnnotations: boolean;
}

// Тул MCP-сервера глазами харнесса.
export interface McpToolSummary {
  // Имя для модели, с префиксом сервера: kedr__search.
  name: string;
  // Имя на самом сервере: search.
  mcpName: string;
  // Пометки, которые прислал сервер; null — сервер их не указал.
  annotations: Record<string, unknown> | null;
  // Классы действий, которые харнесс вывел из пометок; пусто, если пометкам не доверяем.
  effects: ToolEffect[];
  // true — тул в hiddenTools: модель его не видит, вызывать его может только сам харнесс.
  hiddenFromModel: boolean;
}

export interface McpServerReadyPayload {
  type: 'mcp_server_ready';
  serverName: string;
  // Как сервер представился: имя и версия.
  serverInfo: { name: string; version: string } | null;
  protocolVersion: string | null;
  // Инструкции сервера — харнесс добавляет их в системный промпт.
  instructions: string | null;
  tools: McpToolSummary[];
  durationMs: number;
}

export interface McpServerFailedPayload {
  type: 'mcp_server_failed';
  serverName: string;
  message: string;
}

// to_server — от харнесса к серверу, from_server — от сервера к харнессу.
export type McpMessageDirection = 'to_server' | 'from_server';

// Одно сообщение JSON-RPC между харнессом и MCP-сервером, как есть.
export interface McpMessagePayload {
  type: 'mcp_message';
  serverName: string;
  direction: McpMessageDirection;
  message: unknown;
}

// Строка, которую сервер написал в stderr: stdout у него занят протоколом.
export interface McpServerLogPayload {
  type: 'mcp_server_log';
  serverName: string;
  text: string;
}

export interface McpServerStoppedPayload {
  type: 'mcp_server_stopped';
  serverName: string;
}

// Исходящий HTTP-запрос харнесса и маршрут, которым он пошёл: через прокси или напрямую.
// Пишется перед каждым запросом к модели, поисковику и загрузкой страницы.
export interface NetworkRequestPayload extends NetworkRequestInfo {
  type: 'network_request';
}

export interface UserMessagePayload {
  type: 'user_message';
  text: string;
}

// Харнесс сам, до запроса к модели, нашёл материал по вопросу пользователя (retrieval.mode: auto).
// Это не просьба модели, поэтому tool_call и tool_result здесь нет.
// Модель по просьбе харнесса сформулировала поисковый запрос (retrieval rewrite).
// Сам запрос к модели — в паре model_request и model_response с purpose: queryRewrite.
export interface QueryRewrittenPayload {
  type: 'query_rewritten';
  requestId: string;
  userQuestion: string;
  // Запрос, по которому харнесс будет искать. Если модель вернула пустой ответ — вопрос пользователя.
  query: string;
  usedFallback: boolean;
}

// Кто сформулировал запрос, по которому искал харнесс.
export type QueryAuthor = 'user' | 'model';

export interface ContextRetrievedPayload {
  type: 'context_retrieved';
  toolName: string;
  arguments: Record<string, unknown>;
  queryAuthor: QueryAuthor;
  userQuestion: string;
  status: 'success' | 'error';
  // При успехе — ровно то, что харнесс вставил в контекст; при ошибке — её текст,
  // а модель получает вопрос без найденного.
  content: string;
  durationMs: number;
}

// Начало проверки опоры ответа с судьёй. У проверки свой трейс: исходный трейс — запись
// сессии, его не трогаем. Здесь — ссылка на него.
export interface GroundingCheckStartedPayload {
  type: 'grounding_check_started';
  sourceTracePath: string;
  // null — в исходном трейсе нет id сессии.
  sourceSessionId: string | null;
  claimCount: number;
  judgeModel: string;
}

// Ветка (этап 9): сессия продолжает чужую запись с шага step. Шаги до него — replay: история
// берётся из тела model_request этого шага в исходном трейсе, без запросов к модели и без тулов.
// С шага step — новый прогон: запросы, тулы и политика по-настоящему.
export type BranchChange =
  // Ничего не меняли — переиграть шаг: видно, насколько модель отвечает по-разному.
  | { kind: 'replay' }
  // Подменили результат тула, который модель получила до шага step.
  | { kind: 'toolResult'; toolCallId: string; toolName: string; before: string; after: string };

export interface BranchStartedPayload {
  type: 'branch_started';
  sourceTracePath: string;
  // null — в исходном трейсе нет id сессии.
  sourceSessionId: string | null;
  // Шаг главного агента в исходной сессии (по порядку его запросов agentStep), с которого новый прогон.
  step: number;
  // Сколько шагов и сообщений истории взято из записи.
  replayedSteps: number;
  replayedMessages: number;
  change: BranchChange;
}

// supported — показанное подтверждает claim; contradicted — противоречит; notFound — в показанном
// об этом нет; unclear — ответ судьи не разобрался.
export type JudgeVerdict = 'supported' | 'contradicted' | 'notFound' | 'unclear';

// Мнение модели-судьи о claim. Мнение, а не проверка: судья сам недетерминирован и может ошибаться.
export interface ClaimJudgedPayload {
  type: 'claim_judged';
  // Запрос к судье — в паре model_request и model_response с тем же requestId.
  requestId: string;
  claimNumber: number;
  claim: string;
  // Строки того, что видела модель в исходной сессии, — их судья видел рядом с claim.
  evidence: string[];
  verdict: JudgeVerdict;
  explanation: string;
}

export interface PromptAssembledPayload {
  type: 'prompt_assembled';
  messages: ChatMessage[];
  // Какие тулы харнесс предложит модели.
  toolNames: string[];
}

// Зачем харнесс обращается к модели: шаг цикла агента или служебный запрос харнесса —
// переформулировать вопрос пользователя в поисковый запрос (retrieval rewrite)
// или оценить claim ответа как судья (check-grounding --judge, этап 5b.3).
// compaction — сжать прошлые ходы диалога в сводку (этап 6.5).
export type ModelRequestPurpose =
  | 'agentStep'
  | 'queryRewrite'
  | 'groundingJudge'
  | 'compaction'
  // Судья evals (этап 8e): ответ агента против рубрики задачи.
  | 'evalJudge';

export interface ModelRequestPayload {
  type: 'model_request';
  requestId: string;
  purpose: ModelRequestPurpose;
  // Номер шага цикла агента: 1 — первый запрос, дальше — после каждого вызова тулов;
  // null — служебный запрос харнесса вне цикла агента.
  iteration: number | null;
  reasoningEffort: ReasoningEffort;
  method: string;
  url: string;
  // Секретные заголовки уже замаскированы.
  headers: Record<string, string>;
  body: Record<string, unknown>;
  // Бюджет prompt (этап 6.2): оценка по частям, лимит и порог; null — бюджет не считали
  // (например, у судьи в check-grounding). В трейсах до этапа 6.2 поля нет.
  budget?: PromptBudget | null;
}

// Кусочек ответа модели по мере генерации (этап 8d.2) — для печатания ответа вживую.
// Это не событие трейса: без номера, в трейс не пишется, браузеру идёт только вживую
// (при переподключении не повторяется — ответ целиком придёт в model_response).
export interface ModelDelta {
  type: 'model_delta';
  sessionId: string;
  // Как у событий: есть только у субагента.
  agentId?: string;
  requestId: string;
  kind: 'reasoning' | 'answer';
  text: string;
}

export interface ModelResponsePayload {
  type: 'model_response';
  requestId: string;
  status: number;
  durationMs: number;
  // Моменты потокового ответа (этап 8d.2); null — ответ пришёл целиком.
  // В трейсах до 8d.2 поля нет.
  timing?: ResponseTiming | null;
  // Сырой ответ провайдера; при потоке — собранный из кусков в том же формате.
  body: unknown;
  // Тот же ответ в нашем нейтральном формате.
  reply: ModelReply;
  cost: RequestCost | null;
}

export interface ModelErrorPayload {
  type: 'model_error';
  requestId: string;
  // null, если ответа не было вовсе (сеть, таймаут).
  status: number | null;
  durationMs: number | null;
  body: unknown;
  message: string;
}

export interface ToolCallPayload {
  type: 'tool_call';
  toolCallId: string;
  toolName: string;
  // Аргументы, как их прислала модель, — строка с JSON.
  argumentsText: string;
  // Те же аргументы после разбора; null, если JSON не разобрался.
  arguments: unknown;
}

// success — тул выполнен; error — не выполнился, модель получит текст ошибки и сможет исправиться;
// denied — пользователь не разрешил действие; blocked — действие запрещено политикой харнесса.
export type ToolResultStatus = 'success' | 'error' | 'denied' | 'blocked';

// Что тул чужого харнесса сделал с файлом (адаптеры 9.4): адаптер знает формат своих тулов
// и кладёт в details.fileEffect одно из трёх — так вкладка «Код» понимает Read/Edit/Write
// Claude Code и read/edit/write OpenCode, не зная их форматов. Путь — от папки проекта.
export type FileEffect =
  // partial — прочитана часть файла (offset или обрезка): исходный текст тогда неизвестен.
  | { kind: 'read'; path: string; content: string; partial: boolean }
  // before: null — файла не было; undefined — неизвестно, каким он был.
  | { kind: 'write'; path: string; before?: string | null; after: string }
  // Правка «заменить фрагмент»: применяем к последнему известному тексту файла.
  | { kind: 'edit'; path: string; oldString: string; newString: string; replaceAll: boolean };

export interface ToolResultPayload {
  type: 'tool_result';
  toolCallId: string;
  toolName: string;
  status: ToolResultStatus;
  // Ровно то, что увидит модель.
  content: string;
  // Подробности для трейса и токеномики, модель их не видит; null, если их нет.
  details: Record<string, unknown> | null;
  // Стоимость вызова в деньгах; null, если тул бесплатный или цена неизвестна.
  cost: ToolCallCost | null;
  durationMs: number;
}

// «След решения»: какие проверки политики выполнены, какая сработала и почему.
// Пишется на каждом вызове тула, даже разрешённом без вопросов.
export interface PermissionEvaluatedPayload {
  type: 'permission_evaluated';
  toolCallId: string;
  toolName: string;
  effects: ToolEffect[];
  targets: ActionTarget[];
  actionDescription: string;
  decision: PermissionDecision;
  reason: string;
  checks: PermissionCheck[];
}

export interface PermissionRequestedPayload {
  type: 'permission_requested';
  toolCallId: string;
  toolName: string;
  // Понятное человеку описание действия: «Удалить файл notes/a.md».
  actionDescription: string;
}

export interface PermissionResolvedPayload {
  type: 'permission_resolved';
  toolCallId: string;
  toolName: string;
  approved: boolean;
  // Кто решил: пользователь, тайм-аут или «спросить некого» — два последних всегда отказ.
  answeredBy: PermissionAnswerSource;
  // Сколько пользователь думал. В длительность тула это время не входит.
  waitedForUserMs: number;
}

// Ответ отдан, сессия ждёт следующего вопроса того же диалога (этап 6.1). История остаётся:
// следующий ход отправит модели и её. Не пришёл вопрос — сессия заканчивается.
// Харнесс обрезал результат тула, прежде чем положить его в историю (этап 6.3). В tool_result —
// всё, что вернул тул; модель получит начало и пометку — это видно в следующем model_request.
export interface ToolResultTruncatedPayload {
  type: 'tool_result_truncated';
  toolCallId: string;
  toolName: string;
  originalChars: number;
  keptChars: number;
  // Оценка: символы ÷ context.charsPerToken.
  originalTokens: number;
  keptTokens: number;
  // Лимит на один результат у выбранного пресета.
  limitTokens: number;
  preset: string;
}

// Харнесс убрал старые результаты тулов, чтобы prompt не перерос порог (этап 6.4). Вызовы и
// ответы модели остались, вместо результатов — заглушки. Начало prompt изменилось — кэш
// провайдера с первого убранного результата не совпадёт.
export interface ToolResultsClearedPayload {
  type: 'tool_results_cleared';
  cleared: { toolCallId: string; toolName: string; tokens: number }[];
  // Оценка prompt до и после, порог и цель очистки, ≈ токенов.
  beforeTokens: number;
  afterTokens: number;
  thresholdTokens: number;
  targetTokens: number;
  preset: string;
}

// Харнесс сжал прошлые ходы диалога в сводку (этап 6.5): сама сводка — ответ на служебный
// запрос requestId (purpose: compaction). История с начала изменилась — кэш провайдера после
// system prompt и описаний тулов не совпадёт.
export interface HistoryCompactedPayload {
  type: 'history_compacted';
  requestId: string;
  replacedMessages: number;
  summary: string;
  // Оценка prompt до и после, порог, ≈ токенов.
  beforeTokens: number;
  afterTokens: number;
  thresholdTokens: number;
  preset: string;
  // Что харнесс дописал к сводке как есть (этап 6b.4); нет — трейс до 6b.
  restored?: RestoredContext;
}

// Каталог скиллов при старте сессии (этап 6b): что модель увидит и в каком режиме.
export interface SkillCatalogPayload {
  type: 'skill_catalog';
  // Папка скиллов от корня проекта.
  directory: string;
  // Папка своих скиллов (skills-custom); нет поля — трейс до них.
  customDirectory?: string;
  skills: SkillSummary[];
  // Папки, которые не прочитались как скилл, — с причиной.
  problems: SkillProblem[];
}

export interface SkillSummary {
  name: string;
  description: string;
  mode: SkillMode;
  files: string[];
  // Размер инструкции, символов: сколько она займёт в prompt, если её загрузить.
  instructionCharacters: number;
  // custom — свой скилл из skills-custom/; нет поля — скилл проекта.
  origin?: 'project' | 'custom';
}

// Инструкция скилла попала в prompt: харнесс при старте, модель тулом load_skill или
// пользователь командой «/имя».
export interface SkillLoadedPayload {
  type: 'skill_loaded';
  name: string;
  trigger: SkillTrigger;
  files: string[];
}

// Память на начало сессии (этап 6b): memo.md попадёт в system prompt.
export interface MemoryLoadedPayload {
  type: 'memory_loaded';
  // Папка памяти в песочнице; модель видит её как /memories.
  directory: string;
  memoPath: string;
  // Размер memo.md, символов; null — файла нет.
  memoCharacters: number | null;
  // Все файлы памяти — пути /memories/…
  files: string[];
}

// Модель изменила память тулом memory.
export interface MemoryUpdatedPayload {
  type: 'memory_updated';
  command: MemoryCommand;
  path: string;
  // rename: новый путь; у остальных команд null.
  newPath: string | null;
}

// Модель прислала план тулом update_progress, харнесс записал его в progress.md (этап 6b).
export interface ProgressUpdatedPayload {
  type: 'progress_updated';
  path: string;
  // Какая это версия плана в сессии, с 1.
  version: number;
  goal: string;
  steps: { title: string; status: StepStatus; note: string | null }[];
}

// Главный агент поручил задачу субагенту тулом delegate_task (этап 6c). Само событие — от
// главного агента (без agentId); события субагента дальше идут с agentId = subagentId.
// Главный агент получит только отчёт.
export interface SubagentStartedPayload {
  type: 'subagent_started';
  // Его события дальше несут agentId с этим значением.
  subagentId: string;
  // Кто из описанных в harness.config.json (subagents.agents).
  agent: string;
  // Вызов delegate_task у главного агента: по нему видно, какой шаг породил субагента.
  // Пустая строка — поручил не агент, а код харнесса (пайплайн, этап 6d).
  parentToolCallId: string;
  // Шаг оркестрации, на котором дано поручение (этап 6d); нет поля — поручил агент тулом.
  stepId?: string;
  task: string;
  // Тулы, которые харнесс дал субагенту.
  toolNames: string[];
  maxIterations: number;
  reasoningEffort: ReasoningEffort;
}

export type SubagentStatus = 'done' | 'failed';

// Оркестратор вернул отчёт на доработку (этап 6d.2): замечание ушло в историю того же субагента,
// дальше — его события с тем же agentId и новый subagent_finished с round.
export interface SubagentResumedPayload {
  type: 'subagent_resumed';
  subagentId: string;
  agent: string;
  feedback: string;
  round: number;
}

// Приёмка отчёта оркестратором (этап 6d.2): принять или вернуть с замечанием.
export interface TaskReviewedPayload {
  type: 'task_reviewed';
  subagentId: string;
  // Задача плана, если оркестратор её указал.
  taskId: string | null;
  verdict: 'accepted' | 'rework';
  comment: string;
  // Какой по счёту отчёт принимали: 1 — первый.
  round: number;
}

// Оркестрация (этап 6d): кто решает порядок шагов — код (pipeline), модель (superagent) или оба.
export type OrchestrationMode = 'pipeline' | 'superagent' | 'hybrid';

// Шаг оркестрации: code — делает сам харнесс; model — один запрос к модели; agents — поручения
// субагентам.
export type OrchestrationStepKind = 'code' | 'model' | 'agents';

export interface OrchestrationStep {
  stepId: string;
  title: string;
  kind: OrchestrationStepKind;
}

export interface OrchestrationStartedPayload {
  type: 'orchestration_started';
  mode: OrchestrationMode;
  // Шаги, известные заранее: у пайплайна — все, их задал код.
  steps: OrchestrationStep[];
  settings: Record<string, unknown>;
}

export interface PlannedTask {
  taskId: string;
  title: string;
  // Кому поручено: имя субагента из subagents.agents.
  agent: string;
}

export interface PlanCreatedPayload {
  type: 'plan_created';
  // Кто составил план: код харнесса или модель.
  author: 'code' | 'model';
  // На каком шаге оркестрации; null — вне шагов.
  stepId: string | null;
  tasks: PlannedTask[];
}

export interface PipelineStepStartedPayload {
  type: 'pipeline_step_started';
  stepId: string;
  title: string;
  kind: OrchestrationStepKind;
}

export type PipelineStepStatus = 'done' | 'warning' | 'failed';

export interface PipelineStepFinishedPayload {
  type: 'pipeline_step_finished';
  stepId: string;
  status: PipelineStepStatus;
  // Что получилось на шаге — коротко, для консоли и интерфейса.
  summary: string;
  durationMs: number;
}

export interface OrchestrationFinishedPayload {
  type: 'orchestration_finished';
  mode: OrchestrationMode;
  status: 'done' | 'failed';
  tasks: number;
  // Сколько раз работу вернули на доработку (этап 6d.2); у пайплайна приёмки нет — 0.
  reworks: number;
  durationMs: number;
}

export interface SubagentFinishedPayload {
  type: 'subagent_finished';
  subagentId: string;
  agent: string;
  parentToolCallId: string;
  // Номер отчёта после доработки (этап 6d.2): 2 — после первой; нет поля — первый отчёт.
  round?: number;
  status: SubagentStatus;
  // Отчёт субагента — он и уходит главному как результат delegate_task; null — не дошёл до отчёта.
  report: string | null;
  // Почему не дошёл: лимит шагов, ошибка модели; null — отчёт есть.
  errorMessage: string | null;
  durationMs: number;
  modelRequests: number;
  usage: TokenUsage;
  modelCost: SessionCost | null;
}

// Агент дошёл до последнего разрешённого шага. Харнесс не обрывает работу, а просит ответить
// по тому, что уже найдено: тулы остаются описаны (кэш prompt совпадает), но звать их нельзя.
export interface IterationLimitReachedPayload {
  type: 'iteration_limit_reached';
  limit: number;
  // Где лимит в harness.config.json: agent.maxIterations или subagents.agents.<имя>.maxIterations.
  setting: string;
  // Пометка харнесса, которая ушла модели перед последним запросом.
  note: string;
}

export interface AwaitingQuestionPayload {
  type: 'awaiting_question';
  // Сколько ходов диалога уже было.
  turn: number;
}

export interface AssistantMessagePayload {
  type: 'assistant_message';
  text: string;
}

export interface SessionFinishedPayload {
  type: 'session_finished';
  durationMs: number;
  modelRequests: number;
  usage: TokenUsage;
  // Стоимость запросов к модели; null, если хоть для одного запроса цена неизвестна.
  modelCost: SessionCost | null;
  // Стоимость платных тулов — по тулу и валюте, в порядке первого вызова.
  toolCosts: ToolCostTotal[];
}

export interface ErrorPayload {
  type: 'error';
  message: string;
}

// Приёмка Код-арены (этап 10): агент ответил — харнесс сам запустил видимые и скрытые тесты
// и сверил, не менял ли агент видимые тесты.
export interface AcceptanceCheckedPayload {
  type: 'acceptance_checked';
  taskId: string;
  passed: boolean;
  visible: { passed: number; failed: number };
  hidden: { passed: number; failed: number; tests: AcceptanceTestCase[] };
  // Видимые тесты, которые агент изменил или удалил. На итог не влияет: приёмка запускает
  // исходные (кроме разрешённых задачей), а дописывать свои тесты агенту можно.
  changedTests: string[];
  // Файлы, которых не было в копии до агента (новые тесты, временные скрипты); нет поля — трейс
  // первых прогонов, до 26.10.2026.
  addedFiles?: string[];
  timedOut: boolean;
  durationMs: number;
  // Вывод TAP, обрезанный.
  output: string;
}

export interface AcceptanceTestCase {
  name: string;
  file: string | null;
  ok: boolean;
  error: string | null;
}

export type HarnessEventPayload =
  | SessionStartedPayload
  | WorkspacePreparedPayload
  | McpServerStartingPayload
  | McpServerReadyPayload
  | McpServerFailedPayload
  | McpMessagePayload
  | McpServerLogPayload
  | McpServerStoppedPayload
  | NetworkRequestPayload
  | UserMessagePayload
  | QueryRewrittenPayload
  | GroundingCheckStartedPayload
  | BranchStartedPayload
  | ClaimJudgedPayload
  | ContextRetrievedPayload
  | PromptAssembledPayload
  | ModelRequestPayload
  | ModelResponsePayload
  | ModelErrorPayload
  | ToolCallPayload
  | PermissionEvaluatedPayload
  | PermissionRequestedPayload
  | PermissionResolvedPayload
  | ToolResultPayload
  | AssistantMessagePayload
  | AwaitingQuestionPayload
  | ToolResultTruncatedPayload
  | ToolResultsClearedPayload
  | HistoryCompactedPayload
  | SkillCatalogPayload
  | SkillLoadedPayload
  | MemoryLoadedPayload
  | MemoryUpdatedPayload
  | ProgressUpdatedPayload
  | IterationLimitReachedPayload
  | SubagentStartedPayload
  | SubagentFinishedPayload
  | SubagentResumedPayload
  | TaskReviewedPayload
  | OrchestrationStartedPayload
  | PlanCreatedPayload
  | PipelineStepStartedPayload
  | PipelineStepFinishedPayload
  | OrchestrationFinishedPayload
  | AcceptanceCheckedPayload
  | SessionFinishedPayload
  | ErrorPayload;

export type HarnessEvent = HarnessEventPayload & EventMetadata;

export type HarnessEventType = HarnessEventPayload['type'];

// Типы событий харнесса — это и есть формат трейса.
// Каждое событие — одна строка JSONL; подробное описание в docs/events.md.

import type { ChatMessage, ModelReply, ReasoningEffort, TokenUsage } from '../model/chatTypes.js';
import type {
  ActionTarget,
  PermissionCheck,
  PermissionDecision,
  ToolEffect,
} from '../permissions/permissionTypes.js';
import type { NetworkRequestInfo } from '../network/NetworkRouter.js';
import type { RetrievalMode } from '../settings/settingsSchema.js';
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
export interface ContextRetrievedPayload {
  type: 'context_retrieved';
  toolName: string;
  arguments: Record<string, unknown>;
  status: 'success' | 'error';
  // При успехе — ровно то, что харнесс вставил в контекст; при ошибке — её текст,
  // а модель получает вопрос без найденного.
  content: string;
  durationMs: number;
}

export interface PromptAssembledPayload {
  type: 'prompt_assembled';
  messages: ChatMessage[];
  // Какие тулы харнесс предложит модели.
  toolNames: string[];
}

export interface ModelRequestPayload {
  type: 'model_request';
  requestId: string;
  // Номер шага цикла агента: 1 — первый запрос, дальше — после каждого вызова тулов.
  iteration: number;
  reasoningEffort: ReasoningEffort;
  method: string;
  url: string;
  // Секретные заголовки уже замаскированы.
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

export interface ModelResponsePayload {
  type: 'model_response';
  requestId: string;
  status: number;
  durationMs: number;
  // Сырой ответ провайдера как есть.
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
  // Сколько пользователь думал. В длительность тула это время не входит.
  waitedForUserMs: number;
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
  | SessionFinishedPayload
  | ErrorPayload;

export type HarnessEvent = HarnessEventPayload & EventMetadata;

export type HarnessEventType = HarnessEventPayload['type'];

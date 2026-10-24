// Типы событий харнесса — это и есть формат трейса.
// Каждое событие — одна строка JSONL; подробное описание в docs/events.md.

import type { ChatMessage, ModelReply, ReasoningEffort, TokenUsage } from '../model/chatTypes.js';
import type { RequestCost, SessionCost } from '../tokenomics/costTypes.js';

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
  // Через какой прокси идут запросы харнесса; null — напрямую.
  networkProxy: string | null;
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

export interface UserMessagePayload {
  type: 'user_message';
  text: string;
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
// denied — пользователь не разрешил действие.
export type ToolResultStatus = 'success' | 'error' | 'denied';

export interface ToolResultPayload {
  type: 'tool_result';
  toolCallId: string;
  toolName: string;
  status: ToolResultStatus;
  // Ровно то, что увидит модель.
  content: string;
  // Подробности для трейса и токеномики, модель их не видит; null, если их нет.
  details: Record<string, unknown> | null;
  durationMs: number;
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
  cost: SessionCost | null;
}

export interface ErrorPayload {
  type: 'error';
  message: string;
}

export type HarnessEventPayload =
  | SessionStartedPayload
  | WorkspacePreparedPayload
  | UserMessagePayload
  | PromptAssembledPayload
  | ModelRequestPayload
  | ModelResponsePayload
  | ModelErrorPayload
  | ToolCallPayload
  | PermissionRequestedPayload
  | PermissionResolvedPayload
  | ToolResultPayload
  | AssistantMessagePayload
  | SessionFinishedPayload
  | ErrorPayload;

export type HarnessEvent = HarnessEventPayload & EventMetadata;

export type HarnessEventType = HarnessEventPayload['type'];

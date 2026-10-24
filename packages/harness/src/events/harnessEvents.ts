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
}

export interface UserMessagePayload {
  type: 'user_message';
  text: string;
}

export interface PromptAssembledPayload {
  type: 'prompt_assembled';
  messages: ChatMessage[];
}

export interface ModelRequestPayload {
  type: 'model_request';
  requestId: string;
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
  | UserMessagePayload
  | PromptAssembledPayload
  | ModelRequestPayload
  | ModelResponsePayload
  | ModelErrorPayload
  | AssistantMessagePayload
  | SessionFinishedPayload
  | ErrorPayload;

export type HarnessEvent = HarnessEventPayload & EventMetadata;

export type HarnessEventType = HarnessEventPayload['type'];

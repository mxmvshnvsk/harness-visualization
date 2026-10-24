// Наш нейтральный формат общения с моделью.
// Харнесс работает только с этими типами, а провайдер переводит их
// в формат конкретного API и обратно. Так визуализация не зависит от провайдера.

export type ChatRole = 'system' | 'user' | 'assistant';

// Насколько усердно модель рассуждает перед ответом. Это наш нейтральный уровень:
// провайдер сам переводит его в параметры своего API (у DeepSeek — thinking и reasoning_effort).
export const REASONING_EFFORTS = ['off', 'low', 'high', 'max'] as const;

export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ModelRequest {
  messages: ChatMessage[];
  reasoningEffort: ReasoningEffort;
}

export interface TokenUsage {
  // Все токены запроса = попавшие в кэш + не попавшие.
  inputTokens: number;
  inputCacheHitTokens: number;
  inputCacheMissTokens: number;
  // Токены ответа, включая рассуждения.
  outputTokens: number;
  // Часть outputTokens, потраченная на рассуждения (если модель «думала»).
  reasoningTokens: number;
}

export interface ModelReply {
  responseId: string;
  model: string;
  // Почему модель остановилась: stop, length, tool_calls и т. д.
  finishReason: string;
  text: string | null;
  // Рассуждения модели перед ответом (у DeepSeek — reasoning_content).
  reasoningText: string | null;
  usage: TokenUsage;
}

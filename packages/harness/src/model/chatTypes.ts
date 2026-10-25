// Наш нейтральный формат общения с моделью.
// Харнесс работает только с этими типами, а провайдер переводит их
// в формат конкретного API и обратно. Так визуализация не зависит от провайдера.

// Насколько усердно модель рассуждает перед ответом. Это наш нейтральный уровень:
// провайдер сам переводит его в параметры своего API (у DeepSeek — thinking и reasoning_effort).
export const REASONING_EFFORTS = ['off', 'low', 'high', 'max'] as const;

export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export interface SystemMessage {
  role: 'system';
  content: string;
}

export interface UserMessage {
  role: 'user';
  content: string;
}

export interface AssistantMessage {
  role: 'assistant';
  // null, если модель только попросила вызвать тулы и ничего не написала.
  content: string | null;
  // Рассуждения, с которыми модель пришла к этому сообщению.
  // DeepSeek требует возвращать их в следующих запросах, если в запросе есть тулы.
  reasoningContent: string | null;
  toolCalls: ToolCall[];
}

export interface ToolResultMessage {
  role: 'tool';
  // Связывает результат с вызовом, который о нём просил.
  toolCallId: string;
  content: string;
}

export type ChatMessage = SystemMessage | UserMessage | AssistantMessage | ToolResultMessage;

export type ChatRole = ChatMessage['role'];

export interface ToolCall {
  id: string;
  name: string;
  // Аргументы приходят строкой с JSON — её ещё нужно разобрать и проверить.
  argumentsText: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  // JSON Schema аргументов — по ней модель понимает, что передавать.
  parameters: Record<string, unknown>;
}

export interface ModelRequest {
  messages: ChatMessage[];
  tools: ToolDefinition[];
  reasoningEffort: ReasoningEffort;
  // none — тулы описаны (prompt тот же, кэш совпадает), но звать их нельзя: только ответ текстом.
  toolChoice?: 'auto' | 'none';
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
  // Пустой список, если модель не просит вызвать тулы.
  toolCalls: ToolCall[];
  usage: TokenUsage;
}

// Моменты потокового ответа (этап 8d.2), в миллисекундах от отправки запроса.
// Каждый токен в трейс не пишем — только три момента, по которым видны фазы инференса.
export interface ResponseTiming {
  // Первый кусок с текстом, рассуждением или тулом: сеть, очередь у провайдера и prefill.
  firstTokenMs: number | null;
  // Первый кусок ответа или вызова тула — рассуждение кончилось. Без рассуждений — то же, что первый токен.
  firstAnswerTokenMs: number | null;
  // Последний кусок с содержимым — модель дописала.
  lastTokenMs: number | null;
  // Сколько кусков SSE прислал провайдер.
  chunks: number;
}

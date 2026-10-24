// Провайдер для любого OpenAI-совместимого API: DeepSeek, OpenAI, OpenRouter, Ollama.
// Запросы отправляются встроенным fetch, без SDK, — так виден ровно тот HTTP-запрос, что уходит.

import type { ModelSettings } from '../settings/settingsSchema.js';
import type {
  ModelReply,
  ModelRequest,
  TokenUsage,
  ToolCall,
  ToolDefinition,
} from './chatTypes.js';
import type { ModelProvider, PreparedHttpRequest, RawHttpResponse } from './modelProvider.js';
import { ModelProviderError } from './ModelProviderError.js';
import {
  wireChatCompletionSchema,
  wireErrorSchema,
  type WireToolCall,
  type WireUsage,
} from './openAiWireSchema.js';
import { buildReasoningParameters } from './reasoningParameters.js';
import { toWireMessages, toWireTools } from './toWireFormat.js';

const CHAT_COMPLETIONS_PATH = 'chat/completions';

export class OpenAiCompatibleProvider implements ModelProvider {
  private readonly settings: ModelSettings;
  private readonly apiKey: string;

  constructor(settings: ModelSettings, apiKey: string) {
    this.settings = settings;
    this.apiKey = apiKey;
  }

  get model(): string {
    return this.settings.model;
  }

  prepareRequest(request: ModelRequest): PreparedHttpRequest {
    return {
      method: 'POST',
      url: buildUrl(this.settings.baseUrl, CHAT_COMPLETIONS_PATH),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: {
        // Особые поля провайдера идут первыми, чтобы не перекрыть основные.
        ...this.settings.requestExtras,
        ...buildReasoningParameters(this.settings.reasoningStyle, request.reasoningEffort),
        model: this.settings.model,
        messages: toWireMessages(request.messages, this.settings.reasoningStyle),
        ...buildToolsParameter(request.tools),
        max_tokens: this.settings.maxOutputTokens,
        stream: false,
      },
    };
  }

  async send(preparedRequest: PreparedHttpRequest): Promise<RawHttpResponse> {
    const startedAt = performance.now();
    const response = await this.fetchWithReadableErrors(preparedRequest);
    const responseText = await response.text();
    return {
      status: response.status,
      durationMs: Math.round(performance.now() - startedAt),
      body: parseJsonOrKeepText(responseText),
    };
  }

  parseReply(rawResponse: RawHttpResponse): ModelReply {
    if (rawResponse.status < 200 || rawResponse.status >= 300) {
      throw new ModelProviderError(
        describeHttpError(rawResponse),
        rawResponse.status,
        rawResponse.body,
      );
    }
    const validation = wireChatCompletionSchema.safeParse(rawResponse.body);
    if (!validation.success) {
      throw new ModelProviderError(
        `Непонятный формат ответа модели:\n${validation.error.message}`,
        rawResponse.status,
        rawResponse.body,
      );
    }
    const completion = validation.data;
    // Мы всегда просим один вариант ответа, поэтому берём первый.
    const firstChoice = completion.choices[0];
    if (firstChoice === undefined) {
      throw new ModelProviderError(
        'В ответе модели нет вариантов',
        rawResponse.status,
        rawResponse.body,
      );
    }
    return {
      responseId: completion.id,
      model: completion.model,
      finishReason: firstChoice.finish_reason ?? 'unknown',
      text: firstChoice.message.content ?? null,
      reasoningText: firstChoice.message.reasoning_content ?? null,
      toolCalls: (firstChoice.message.tool_calls ?? []).map(fromWireToolCall),
      usage: normalizeUsage(completion.usage),
    };
  }

  private async fetchWithReadableErrors(preparedRequest: PreparedHttpRequest): Promise<Response> {
    try {
      return await fetch(preparedRequest.url, {
        method: preparedRequest.method,
        headers: preparedRequest.headers,
        body: JSON.stringify(preparedRequest.body),
        signal: AbortSignal.timeout(this.settings.requestTimeoutMs),
      });
    } catch (error) {
      throw new ModelProviderError(
        `Не удалось связаться с моделью: ${describeFetchFailure(error)}`,
        null,
        null,
      );
    }
  }
}

// Без тулов поле tools не передаём совсем: часть API не принимает пустой список.
function buildToolsParameter(tools: ToolDefinition[]): Record<string, unknown> {
  if (tools.length === 0) {
    return {};
  }
  return { tools: toWireTools(tools) };
}

function fromWireToolCall(wireToolCall: WireToolCall): ToolCall {
  return {
    id: wireToolCall.id,
    name: wireToolCall.function.name,
    argumentsText: wireToolCall.function.arguments,
  };
}

function buildUrl(baseUrl: string, path: string): string {
  const baseWithSlash = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL(path, baseWithSlash).toString();
}

// fetch пишет просто «fetch failed», а настоящая причина (DNS, отказ соединения,
// прокси, таймаут) лежит в error.cause — показываем её.
function describeFetchFailure(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }
  if (error.cause instanceof Error) {
    return `${error.message} (${error.cause.message})`;
  }
  return error.message;
}

function parseJsonOrKeepText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function describeHttpError(rawResponse: RawHttpResponse): string {
  const summary = `Модель ответила ошибкой HTTP ${rawResponse.status}`;
  const errorValidation = wireErrorSchema.safeParse(rawResponse.body);
  if (!errorValidation.success) {
    return summary;
  }
  return `${summary}: ${errorValidation.data.error.message}`;
}

function normalizeUsage(wireUsage: WireUsage): TokenUsage {
  const inputTokens = wireUsage.prompt_tokens;
  const inputCacheHitTokens =
    wireUsage.prompt_cache_hit_tokens ?? wireUsage.prompt_tokens_details?.cached_tokens ?? 0;
  const inputCacheMissTokens =
    wireUsage.prompt_cache_miss_tokens ?? inputTokens - inputCacheHitTokens;
  return {
    inputTokens,
    inputCacheHitTokens,
    inputCacheMissTokens,
    outputTokens: wireUsage.completion_tokens,
    reasoningTokens: wireUsage.completion_tokens_details?.reasoning_tokens ?? 0,
  };
}

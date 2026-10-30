// Провайдер для любого OpenAI-совместимого API: DeepSeek, OpenAI, OpenRouter, Ollama.
// Запросы отправляются встроенным fetch, без SDK, — так виден ровно тот HTTP-запрос, что уходит.

import { describeFetchFailure } from '../http/describeFetchFailure.js';
import { HARNESS_USER_AGENT } from '../http/userAgent.js';
import type { RoutedFetch } from '../network/NetworkRouter.js';
import type { ModelSettings } from '../settings/settingsSchema.js';
import type { RequestCost } from '../tokenomics/costTypes.js';
import type {
  ModelReply,
  ModelRequest,
  ReplyLogprobs,
  TokenUsage,
  ToolCall,
  ToolDefinition,
} from './chatTypes.js';
import type {
  DeltaListener,
  ModelProvider,
  PreparedHttpRequest,
  RawHttpResponse,
} from './modelProvider.js';
import { readCompletionStream } from './readCompletionStream.js';
import { ModelProviderError } from './ModelProviderError.js';
import {
  wireChatCompletionSchema,
  wireErrorSchema,
  type WireLogprobs,
  type WireToolCall,
  type WireUsage,
} from './openAiWireSchema.js';
import { buildReasoningParameters } from './reasoningParameters.js';
import { toWireMessages, toWireTools } from './toWireFormat.js';

const CHAT_COMPLETIONS_PATH = 'chat/completions';

export class OpenAiCompatibleProvider implements ModelProvider {
  private readonly settings: ModelSettings;
  private readonly apiKey: string;
  private readonly fetchImpl: RoutedFetch;

  constructor(settings: ModelSettings, apiKey: string, fetchImpl: RoutedFetch) {
    this.settings = settings;
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
  }

  get model(): string {
    return this.settings.model;
  }

  prepareRequest(request: ModelRequest): PreparedHttpRequest {
    const topLogprobs =
      request.topLogprobs ??
      (this.settings.topLogprobs > 0 ? this.settings.topLogprobs : undefined);
    return {
      method: 'POST',
      url: buildUrl(this.baseUrlFor(request), CHAT_COMPLETIONS_PATH),
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': HARNESS_USER_AGENT,
        ...(this.settings.apiKeyVariable === null
          ? {}
          : { Authorization: `Bearer ${this.apiKey}` }),
        ...(this.settings.dialect === 'openrouter'
          ? {
              'HTTP-Referer': 'https://github.com/mxmvshnvsk/harness-visualization',
              'X-Title': 'harness-visualization',
            }
          : {}),
      },
      body: {
        // Особые поля провайдера идут первыми, чтобы не перекрыть основные.
        ...this.settings.requestExtras,
        ...buildReasoningParameters(this.settings.reasoningStyle, request.reasoningEffort),
        model: this.settings.model,
        messages: [
          ...toWireMessages(request.messages, this.settings.reasoningStyle),
          // DeepSeek: последнее сообщение assistant с prefix: true — продолжить с этого начала.
          ...(request.assistantPrefix === undefined
            ? []
            : [{ role: 'assistant', content: request.assistantPrefix, prefix: true }]),
        ],
        ...buildToolsParameter(request.tools, request.toolChoice ?? 'auto'),
        [this.settings.outputTokenParameter ?? 'max_tokens']: this.settings.maxOutputTokens,
        ...(topLogprobs === undefined ? {} : { logprobs: true, top_logprobs: topLogprobs }),
        ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
        stream: this.settings.stream,
        // Без этого в потоке нет usage — не узнаем ни токены, ни стоимость.
        ...(this.settings.stream ? { stream_options: { include_usage: true } } : {}),
      },
    };
  }

  // Продолжение с заданного начала — у DeepSeek только через бета-адрес API.
  private baseUrlFor(request: ModelRequest): string {
    if (request.assistantPrefix === undefined) {
      return this.settings.baseUrl;
    }
    if (this.settings.prefixCompletionBaseUrl === null) {
      throw new ModelProviderError(
        'Провайдер не умеет продолжать с заданного начала: в harness.config.json нет model.prefixCompletionBaseUrl',
        null,
        null,
      );
    }
    return this.settings.prefixCompletionBaseUrl;
  }

  async send(
    preparedRequest: PreparedHttpRequest,
    onDelta: DeltaListener = () => undefined,
  ): Promise<RawHttpResponse> {
    const startedAt = performance.now();
    const response = await this.fetchWithReadableErrors(preparedRequest);
    // Ошибку провайдер присылает обычным JSON даже в ответ на запрос с потоком.
    if (isEventStream(response) && response.body !== null) {
      const assembled = await readCompletionStream(response.body, startedAt, onDelta);
      return {
        status: response.status,
        durationMs: Math.round(performance.now() - startedAt),
        body: assembled.body,
        timing: assembled.timing,
      };
    }
    const responseText = await response.text();
    return {
      status: response.status,
      durationMs: Math.round(performance.now() - startedAt),
      body: parseJsonOrKeepText(responseText),
      timing: null,
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
      reasoningText: firstChoice.message.reasoning_content ?? firstChoice.message.reasoning ?? null,
      ...(firstChoice.message.reasoning_details === null ||
      firstChoice.message.reasoning_details === undefined
        ? {}
        : { reasoningDetails: firstChoice.message.reasoning_details }),
      toolCalls: (firstChoice.message.tool_calls ?? []).map(fromWireToolCall),
      usage: normalizeUsage(completion.usage),
      ...(this.settings.dialect === 'openrouter'
        ? { cost: providerCost(completion.usage.cost) }
        : {}),
      ...(firstChoice.logprobs ? { logprobs: fromWireLogprobs(firstChoice.logprobs) } : {}),
    };
  }

  private async fetchWithReadableErrors(preparedRequest: PreparedHttpRequest): Promise<Response> {
    try {
      return await this.fetchImpl(preparedRequest.url, {
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

// OpenRouter сообщает итог, но не разбивку стоимости. Не выдаём выдуманные нули за данные.
function providerCost(total: number | null | undefined): RequestCost | null {
  if (total === undefined || total === null) {
    return null;
  }
  return {
    currency: 'USD',
    tariffName: 'OpenRouter usage.cost',
    total,
    inputCacheHit: null,
    inputCacheMiss: null,
    output: null,
    pricesCheckedAt: '',
    source: 'provider',
  };
}

// Без тулов поле tools не передаём совсем: часть API не принимает пустой список.
function buildToolsParameter(
  tools: ToolDefinition[],
  toolChoice: 'auto' | 'none',
): Record<string, unknown> {
  if (tools.length === 0) {
    return {};
  }
  return { tools: toWireTools(tools), ...(toolChoice === 'none' ? { tool_choice: 'none' } : {}) };
}

function fromWireToolCall(wireToolCall: WireToolCall): ToolCall {
  return {
    id: wireToolCall.id,
    name: wireToolCall.function.name,
    argumentsText: wireToolCall.function.arguments,
  };
}

function fromWireLogprobs(wire: WireLogprobs): ReplyLogprobs {
  const tokens = (items: WireLogprobs['content']) =>
    (items ?? []).map((item) => ({
      token: item.token,
      logprob: item.logprob,
      top: (item.top_logprobs ?? []).map((top) => ({ token: top.token, logprob: top.logprob })),
    }));
  return { content: tokens(wire.content), reasoning: tokens(wire.reasoning_content) };
}

function isEventStream(response: Response): boolean {
  return response.ok && (response.headers.get('content-type') ?? '').includes('text/event-stream');
}

function buildUrl(baseUrl: string, path: string): string {
  const baseWithSlash = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL(path, baseWithSlash).toString();
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

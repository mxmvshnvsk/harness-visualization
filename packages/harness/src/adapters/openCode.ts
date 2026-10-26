// Адаптер (этап 9.4): экспорт сессии OpenCode — `opencode session export` (OpenCode 2.x) —
// в наши события, чтобы смотреть его в плеере, инспекторе, «Диалоге» и вкладке «Код».
//
// Формат описан по экспорту OpenCode 2.1.4 (26.10.2026); официально он не задокументирован.
// Устроен проще записи Claude Code: один JSON — сведения о сессии (info) и сообщения
// по порядку:
//   - user — вопрос пользователя (text);
//   - assistant — один ответ модели: блоки content (reasoning, text, tool), finish, tokens,
//     cost. Тулы OpenCode выполняет, пока ответ ещё пишется, и результат тула лежит прямо
//     в его блоке: state.input, state.content, state.status;
//   - idle — ход закончен (outcome).
// Токены: tokens.input — вход без кэша, cache.read и cache.write — отдельно; цену OpenCode
// пишет сам — она есть и у сообщения, и у сессии.

import type { HarnessEvent, HarnessEventPayload, ImportedFrom } from '../events/harnessEvents.js';
import type { ModelReply, ReasoningEffort, TokenUsage, ToolCall } from '../model/chatTypes.js';
import { maskHomePaths, maskSecretText } from './maskSecretText.js';
import { reconstructRequests } from './reconstructRequests.js';

interface Usage {
  input?: number;
  output?: number;
  reasoning?: number;
  cache?: { read?: number; write?: number };
}

interface Block {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  state?: {
    status?: string;
    input?: unknown;
    content?: { type?: string; text?: string }[];
    metadata?: { exit?: number; truncated?: boolean };
  };
  time?: { created?: number; ran?: number; completed?: number };
}

interface Message {
  id?: string;
  type?: string;
  text?: string;
  time?: { created?: number; streamed?: number; completed?: number };
  model?: { id?: string; providerID?: string; variant?: string };
  content?: Block[];
  finish?: string;
  tokens?: Usage;
  cost?: number;
  outcome?: string;
}

interface Export {
  info?: {
    id?: string;
    model?: { id?: string; providerID?: string; variant?: string };
    cost?: number;
    time?: { created?: number };
    location?: { directory?: string };
  };
  messages?: Message[];
}

const KNOWN_BLOCKS = new Set(['reasoning', 'text', 'tool']);
const EFFORTS: readonly ReasoningEffort[] = ['off', 'low', 'high', 'max'];

export function isOpenCodeExport(value: unknown): value is Export {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Export;
  return (
    typeof candidate.info?.id === 'string' &&
    candidate.info.id.startsWith('ses_') &&
    Array.isArray(candidate.messages) &&
    candidate.messages.every((message) => typeof message.type === 'string')
  );
}

// Ключи и домашняя папка маскируются во всём тексте экспорта до разбора, как у Claude Code.
export function convertOpenCode(text: string): HarnessEvent[] {
  const parsed: unknown = JSON.parse(maskHomePaths(maskSecretText(text)));
  if (!isOpenCodeExport(parsed)) {
    throw new Error('Это не экспорт сессии OpenCode: нет info.id вида ses_… и messages');
  }
  const writer = new Writer(parsed);
  writer.convert();
  return reconstructRequests(writer.events);
}

class Writer {
  readonly events: HarnessEvent[] = [];
  private readonly sessionId: string;
  private time: number;
  private iteration = 0;
  private requests = 0;
  private readonly usage = emptyUsage();
  private readonly unknownBlocks = new Map<string, number>();

  constructor(private readonly session: Export) {
    this.sessionId = (session.info?.id ?? 'ses_imported').replace(/^ses_/, '').slice(0, 8);
    this.time = session.info?.time?.created ?? 0;
  }

  convert(): void {
    const messages = this.session.messages ?? [];
    this.countUnknownBlocks(messages);
    const startedAt = this.time;
    this.emit(startedAt, this.sessionStarted());
    for (const message of messages) {
      if (message.type === 'user') {
        this.user(message);
      } else if (message.type === 'assistant') {
        this.assistant(message);
      }
    }
    this.emit(this.time, {
      type: 'session_finished',
      durationMs: this.time - startedAt,
      modelRequests: this.requests,
      usage: this.usage,
      modelCost: sessionCost(this.session.info?.cost),
      toolCosts: [],
    });
  }

  private countUnknownBlocks(messages: readonly Message[]): void {
    const blocks = messages.flatMap((message) => message.content ?? []);
    for (const block of blocks.filter((item) => !KNOWN_BLOCKS.has(item.type))) {
      this.unknownBlocks.set(block.type, (this.unknownBlocks.get(block.type) ?? 0) + 1);
    }
  }

  private sessionStarted(): HarnessEventPayload {
    const model = this.session.info?.model;
    const variant = model?.variant as ReasoningEffort | undefined;
    return {
      type: 'session_started',
      providerName: model?.providerID ?? 'неизвестно',
      baseUrl: '',
      model: model?.id ?? 'неизвестно',
      reasoningEffort: variant !== undefined && EFFORTS.includes(variant) ? variant : 'high',
      networkProxy: null,
      searchProvider: null,
      retrievalMode: 'tool',
      subagents: null,
      orchestration: null,
      demoProject: false,
      importedFrom: this.importedFrom(),
    };
  }

  private importedFrom(): ImportedFrom {
    const missing = [
      'system prompt и описания тулов — в экспорте их нет; во вкладке «Контекст» это остаток от настоящего input, история собрана заново',
      'решения политики разрешений и сетевые маршруты — OpenCode их не пишет',
      'цена — только итог по шагу от OpenCode, без разбивки на кэш и вывод',
    ];
    for (const [type, count] of this.unknownBlocks) {
      missing.push(`блоки «${type}»: ${String(count)} — адаптер их пока не понимает`);
    }
    return { harness: 'OpenCode', version: null, missing };
  }

  private user(message: Message): void {
    const at = this.at(message.time?.created);
    this.iteration = 0;
    this.emit(at, { type: 'user_message', text: message.text ?? '' });
  }

  private assistant(message: Message): void {
    const id = message.id ?? `msg_${String(this.requests + 1)}`;
    const time = message.time ?? {};
    const requestedAt = this.at(time.created);
    this.iteration += 1;
    this.requests += 1;
    const reply = toReply(id, message);
    addUsage(this.usage, reply.usage);
    this.emit(requestedAt, modelRequest(id, this.iteration, message.model?.variant));
    const answeredAt = this.at(time.streamed ?? time.completed);
    this.emit(answeredAt, {
      type: 'model_response',
      requestId: id,
      status: 200,
      durationMs: Math.max(0, answeredAt - requestedAt),
      timing: null,
      body: {},
      reply,
      cost: toCost(message.cost),
    });
    for (const block of (message.content ?? []).filter((item) => item.type === 'tool')) {
      this.tool(block);
    }
    this.at(time.completed);
    if (reply.toolCalls.length === 0 && reply.text !== null) {
      this.emit(this.time, { type: 'assistant_message', text: reply.text });
    }
  }

  private tool(block: Block): void {
    const call = toToolCall(block);
    const time = block.time ?? {};
    this.emit(this.at(time.created), {
      type: 'tool_call',
      toolCallId: call.id,
      toolName: call.name,
      argumentsText: call.argumentsText,
      arguments: block.state?.input ?? null,
    });
    this.emit(this.at(time.completed), toolResult(call, block.state ?? {}, time));
  }

  // Время сообщения, но не раньше предыдущего события: плееру нужен порядок. Тулы OpenCode
  // начинаются, пока ответ ещё пишется, — у нас вызов тула идёт после ответа.
  private at(value: number | undefined): number {
    this.time = typeof value === 'number' ? Math.max(this.time, value) : this.time;
    return this.time;
  }

  private emit(at: number, payload: HarnessEventPayload): void {
    this.events.push({
      ...payload,
      sequence: this.events.length + 1,
      sessionId: this.sessionId,
      timestamp: new Date(at).toISOString(),
    });
  }
}

function modelRequest(
  id: string,
  iteration: number,
  variant: string | undefined,
): HarnessEventPayload {
  const effort = EFFORTS.find((item) => item === variant) ?? 'high';
  return {
    type: 'model_request',
    requestId: id,
    purpose: 'agentStep',
    iteration,
    reasoningEffort: effort,
    method: 'POST',
    url: '',
    headers: {},
    body: {},
  };
}

function toolResult(
  call: ToolCall,
  state: NonNullable<Block['state']>,
  time: NonNullable<Block['time']>,
): HarnessEventPayload {
  const ranAt = time.ran ?? time.created ?? 0;
  return {
    type: 'tool_result',
    toolCallId: call.id,
    toolName: call.name,
    status: state.status === 'completed' ? 'success' : 'error',
    content: (state.content ?? []).map((part) => part.text ?? `[${part.type ?? '?'}]`).join('\n'),
    details: state.metadata === undefined ? null : { ...state.metadata },
    cost: null,
    durationMs: Math.max(0, (time.completed ?? ranAt) - ranAt),
  };
}

function sessionCost(cost: number | undefined): { currency: string; total: number } | null {
  return typeof cost === 'number' ? { currency: 'USD', total: cost } : null;
}

function toReply(id: string, message: Message): ModelReply {
  const blocks = message.content ?? [];
  const join = (type: string): string | null => {
    const text = blocks
      .filter((block) => block.type === type)
      .map((block) => block.text ?? '')
      .join('\n\n');
    return text === '' ? null : text;
  };
  return {
    responseId: id,
    model: message.model?.id ?? 'неизвестно',
    finishReason: message.finish ?? 'unknown',
    text: join('text'),
    reasoningText: join('reasoning'),
    toolCalls: blocks.filter((block) => block.type === 'tool').map(toToolCall),
    usage: toUsage(message.tokens),
  };
}

function toToolCall(block: Block): ToolCall {
  return {
    id: block.id ?? 'tool',
    name: block.name ?? 'тул',
    argumentsText: JSON.stringify(block.state?.input ?? {}),
  };
}

// OpenCode делит вход, как Anthropic: без кэша, прочитано из кэша, записано в кэш.
function toUsage(tokens: Usage | undefined): TokenUsage {
  const counts = { input: 0, output: 0, reasoning: 0, ...tokens };
  const cache = { read: 0, write: 0, ...counts.cache };
  const fresh = counts.input + cache.write;
  return {
    inputTokens: fresh + cache.read,
    inputCacheHitTokens: cache.read,
    inputCacheMissTokens: fresh,
    outputTokens: counts.output,
    reasoningTokens: counts.reasoning,
  };
}

// Цену шага OpenCode пишет одним числом: разбивки на кэш и вывод в экспорте нет — нули там
// означают «неизвестно», интерфейс показывает только итог и тариф.
function toCost(
  cost: number | undefined,
): Extract<HarnessEventPayload, { type: 'model_response' }>['cost'] {
  if (typeof cost !== 'number') {
    return null;
  }
  return {
    currency: 'USD',
    tariffName: 'по данным OpenCode',
    inputCacheHit: 0,
    inputCacheMiss: 0,
    output: 0,
    total: cost,
    pricesCheckedAt: '',
  };
}

function emptyUsage(): TokenUsage {
  return {
    inputTokens: 0,
    inputCacheHitTokens: 0,
    inputCacheMissTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
  };
}

function addUsage(total: TokenUsage, usage: TokenUsage): void {
  total.inputTokens += usage.inputTokens;
  total.inputCacheHitTokens += usage.inputCacheHitTokens;
  total.inputCacheMissTokens += usage.inputCacheMissTokens;
  total.outputTokens += usage.outputTokens;
  total.reasoningTokens += usage.reasoningTokens;
}

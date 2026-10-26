// Адаптер (этап 9.4): запись сессии Claude Code (~/.claude/projects/<проект>/<id>.jsonl) —
// в наши события, чтобы её можно было смотреть в нашем плеере, инспекторе и «Диалоге».
//
// Формат официально не описан: это внутренняя запись Claude Code, она меняется от версии
// к версии. Адаптер берёт только устойчивое ядро — сообщения в формате Anthropic Messages API:
//   - запись user со строкой или блоками text — вопрос пользователя;
//   - записи assistant с общим message.id — один ответ модели, по записи на блок
//     (thinking, text, tool_use); usage — в каждой, одинаковый;
//   - запись user с блоками tool_result — результаты тулов. Тулы Claude Code запускает, пока
//     ответ ещё пишется, поэтому результат бывает раньше последнего блока своего ответа.
//   - запись system compact_boundary и следующая за ней сводка (isCompactSummary) —
//     компакция истории, как наша history_compacted.
// Остальное (служебные записи интерфейса, субагенты isSidechain) пропускается
// и перечисляется в importedFrom.missing — честно, а не пустотой.

import type { HarnessEvent, HarnessEventPayload, ImportedFrom } from '../events/harnessEvents.js';
import type { ModelReply, TokenUsage, ToolCall } from '../model/chatTypes.js';
import { claudeCodeFileEffect } from './fileEffects.js';
import { maskHomePaths, maskSecretText } from './maskSecretText.js';
import { reconstructRequests } from './reconstructRequests.js';

interface Block {
  type: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
}

interface Entry {
  type?: string;
  subtype?: string;
  uuid?: string;
  sessionId?: string;
  timestamp?: string;
  version?: string;
  isSidechain?: boolean;
  agentId?: string;
  cwd?: string;
  // Что увидел интерфейс Claude Code: у Read — текст файла, у Edit и Write — файл до правки.
  toolUseResult?: unknown;
  isMeta?: boolean;
  isCompactSummary?: boolean;
  compactMetadata?: { preTokens?: number; postTokens?: number };
  message?: {
    id?: string;
    model?: string;
    role?: string;
    stop_reason?: string | null;
    content?: string | Block[];
    usage?: AnthropicUsage;
  };
}

interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  output_tokens_details?: { thinking_tokens?: number };
}

const REPLACED = new Set(['user_message', 'model_response', 'tool_result']);

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

export function parseClaudeCodeLines(text: string): Entry[] {
  const entries: Entry[] = [];
  for (const line of text.split('\n')) {
    if (line.trim() === '') {
      continue;
    }
    try {
      const value: unknown = JSON.parse(line);
      if (typeof value === 'object' && value !== null) {
        entries.push(value);
      }
    } catch {
      // Оборванная строка в конце записи — пропускаем.
    }
  }
  return entries;
}

export function isClaudeCodeTranscript(entries: readonly Entry[]): boolean {
  return entries.some(
    (entry) =>
      (entry.type === 'assistant' || entry.type === 'user') &&
      typeof entry.message === 'object' &&
      typeof entry.sessionId === 'string',
  );
}

// Ключи и домашняя папка маскируются во всём тексте записи до разбора: так ничего не
// просочится через поле, о котором адаптер не знает.
export function convertClaudeCode(text: string): HarnessEvent[] {
  const entries = parseClaudeCodeLines(maskHomePaths(maskSecretText(text)));
  if (!isClaudeCodeTranscript(entries)) {
    throw new Error('Это не запись сессии Claude Code: нет записей user и assistant с sessionId');
  }
  const builder = new EventBuilder(entries);
  builder.convert();
  return reconstructRequests(builder.events);
}

class EventBuilder {
  readonly events: HarnessEvent[] = [];
  private readonly sessionId: string;
  private readonly main: Entry[];
  private readonly groups = new Map<string, Entry[]>();
  private readonly emitted = new Set<string>();
  private readonly toolCalls = new Map<string, { name: string; input: unknown }>();
  private time = 0;
  private iteration = 0;
  private requests = 0;
  private compactions = 0;
  private boundary: Entry | null = null;
  private readonly usage: TokenUsage = emptyUsage();
  // Папка проекта (уже замаскированная): пути файлов во вкладке «Код» — от неё.
  private readonly cwd: string | null;

  constructor(private readonly entries: readonly Entry[]) {
    this.sessionId = (entries.find((entry) => entry.sessionId)?.sessionId ?? 'imported').slice(
      0,
      8,
    );
    this.main = entries.filter((entry) => entry.isSidechain !== true);
    this.cwd = this.main.find((entry) => typeof entry.cwd === 'string')?.cwd ?? null;
    for (const entry of this.main) {
      const id = entry.type === 'assistant' ? entry.message?.id : undefined;
      if (id !== undefined) {
        this.groups.set(id, [...(this.groups.get(id) ?? []), entry]);
      }
    }
  }

  convert(): void {
    // Начало — первая запись диалога: служебные записи интерфейса бывают намного раньше.
    const startedAt = timeOf(this.main.find((entry) => isDialogEntry(entry)));
    this.time = startedAt;
    this.emit(this.time, this.sessionStarted());
    for (const entry of this.main) {
      if (entry.type === 'user') {
        this.user(entry);
      } else if (entry.type === 'assistant') {
        this.assistant(entry);
      } else if (entry.subtype === 'compact_boundary') {
        this.flushBoundary('');
        this.boundary = entry;
      }
    }
    this.flushBoundary('');
    this.emit(this.time, {
      type: 'session_finished',
      durationMs: this.time - startedAt,
      modelRequests: this.requests,
      usage: this.usage,
      modelCost: null,
      toolCosts: [],
    });
  }

  private sessionStarted(): HarnessEventPayload {
    const model = this.main.find((entry) => entry.message?.model !== undefined)?.message?.model;
    return {
      type: 'session_started',
      providerName: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      model: model ?? 'неизвестно',
      reasoningEffort: 'high',
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
    const sidechain = this.entries.filter((entry) => entry.isSidechain === true).length;
    const missing = [
      'system prompt и описания тулов — в записи их нет; во вкладке «Контекст» это остаток от настоящего input, история собрана заново',
      'решения политики разрешений и сетевые маршруты — Claude Code их не пишет',
      'цена: тарифы Anthropic в адаптере не заданы',
    ];
    if (sidechain > 0) {
      missing.push(`субагенты: ${String(sidechain)} записей пропущено`);
    }
    if (this.entries.some((entry) => entry.subtype === 'compact_boundary')) {
      missing.push(
        'компакция: запрос, которым модель писала сводку, — в записи только сама сводка',
      );
    }
    const version = this.entries.find((entry) => entry.version !== undefined)?.version ?? null;
    return { harness: 'Claude Code', version, missing };
  }

  private user(entry: Entry): void {
    const content = entry.message?.content ?? '';
    const at = this.at(entry);
    if (Array.isArray(content) && content.some((block) => block.type === 'tool_result')) {
      this.toolResults(entry, content, at);
      return;
    }
    const text = typeof content === 'string' ? content : textOf(content);
    if (entry.isCompactSummary === true) {
      this.flushBoundary(text);
    } else if (entry.isMeta !== true && text.trim() !== '') {
      this.iteration = 0;
      this.emit(at, { type: 'user_message', text });
    }
  }

  private toolResults(entry: Entry, content: readonly Block[], at: number): void {
    const results = content.filter((item) => item.type === 'tool_result');
    for (const block of results) {
      // toolUseResult один на запись — относится к результату, только если он один.
      this.toolResult(block, at, results.length === 1 ? entry : null);
    }
  }

  private toolResult(block: Block, at: number, entry: Entry | null): void {
    const toolCallId = block.tool_use_id ?? '';
    const call = this.toolCalls.get(toolCallId);
    const fileEffect =
      call === undefined || entry === null
        ? null
        : claudeCodeFileEffect(call.name, call.input, entry.toolUseResult, this.cwd);
    this.emit(at, {
      type: 'tool_result',
      toolCallId,
      toolName: call?.name ?? 'тул',
      status: block.is_error === true ? 'error' : 'success',
      content: typeof block.content === 'string' ? block.content : textOf(block.content),
      details: fileEffect === null ? null : { fileEffect },
      cost: null,
      durationMs: 0,
    });
  }

  // Первая запись ответа — весь ответ сразу: запрос, ответ, вызовы тулов. Остальные записи
  // того же message.id уже учтены.
  private assistant(entry: Entry): void {
    const id = entry.message?.id;
    if (id === undefined || this.emitted.has(id)) {
      return;
    }
    this.emitted.add(id);
    const { finishedAt, ...reply } = collectReply(id, this.groups.get(id) ?? [entry]);
    this.iteration += 1;
    this.requests += 1;
    addUsage(this.usage, reply.usage);
    this.emit(this.time, modelRequest(id, this.iteration));
    const requestedAt = this.time;
    const answeredAt = this.at(entry);
    this.emit(answeredAt, {
      type: 'model_response',
      requestId: id,
      status: 200,
      durationMs: Math.max(0, finishedAt - requestedAt),
      timing: null,
      body: {},
      reply,
      cost: null,
    });
    for (const call of reply.toolCalls) {
      const input = parseArguments(call.argumentsText);
      this.toolCalls.set(call.id, { name: call.name, input });
      this.emit(answeredAt, {
        type: 'tool_call',
        toolCallId: call.id,
        toolName: call.name,
        argumentsText: call.argumentsText,
        arguments: input,
      });
    }
    if (reply.toolCalls.length === 0 && reply.text !== null) {
      this.emit(answeredAt, { type: 'assistant_message', text: reply.text });
    }
  }

  // Компакция: граница несёт размеры до и после, следующая запись — саму сводку.
  private flushBoundary(summary: string): void {
    if (this.boundary === null) {
      return;
    }
    const meta = this.boundary.compactMetadata;
    this.compactions += 1;
    this.emit(this.at(this.boundary), {
      type: 'history_compacted',
      requestId: `compaction-${String(this.compactions)}`,
      // Сколько сообщений диалога было до сводки — сколько из них адаптер видел.
      replacedMessages: this.events.filter((event) => REPLACED.has(event.type)).length,
      summary,
      beforeTokens: meta?.preTokens ?? 0,
      afterTokens: meta?.postTokens ?? 0,
      thresholdTokens: 0,
      preset: 'Claude Code',
    });
    this.boundary = null;
  }

  // Время записи, но не раньше предыдущего события: плееру нужен порядок.
  private at(entry: Entry): number {
    const parsed = Date.parse(entry.timestamp ?? '');
    this.time = Number.isNaN(parsed) ? this.time : Math.max(this.time, parsed);
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

function modelRequest(id: string, iteration: number): HarnessEventPayload {
  return {
    type: 'model_request',
    requestId: id,
    purpose: 'agentStep',
    iteration,
    reasoningEffort: 'high',
    method: 'POST',
    url: ANTHROPIC_URL,
    headers: {},
    body: {},
  };
}

function collectReply(id: string, group: readonly Entry[]): ModelReply & { finishedAt: number } {
  const blocks = group.flatMap((item) => blocksOf(item));
  const last = group.at(-1)?.message ?? {};
  return {
    responseId: id,
    model: last.model ?? 'неизвестно',
    finishReason: last.stop_reason ?? 'unknown',
    text: joinBlocks(blocks, 'text'),
    reasoningText: joinBlocks(blocks, 'thinking'),
    toolCalls: blocks.filter((block) => block.type === 'tool_use').map(toToolCall),
    usage: toUsage(last.usage),
    finishedAt: timeOf(group.at(-1)),
  };
}

function isDialogEntry(entry: Entry): boolean {
  return entry.type === 'user' || entry.type === 'assistant' || entry.type === 'system';
}

function timeOf(entry: Entry | undefined): number {
  const parsed = Date.parse(entry?.timestamp ?? '');
  return Number.isNaN(parsed) ? 0 : parsed;
}

// null, когда блоков такого типа нет: так пишет ответы и наш харнесс.
function joinBlocks(blocks: readonly Block[], type: 'text' | 'thinking'): string | null {
  const joined = blocks
    .filter((block) => block.type === type)
    .map((block) => (type === 'text' ? block.text : block.thinking) ?? '')
    .join('\n\n');
  return joined === '' ? null : joined;
}

function blocksOf(entry: Entry): Block[] {
  const content = entry.message?.content;
  return Array.isArray(content) ? content : [];
}

function textOf(content: unknown): string {
  if (!Array.isArray(content)) {
    return '';
  }
  return (content as Block[])
    .map((block) => (block.type === 'text' ? (block.text ?? '') : `[${block.type}]`))
    .join('\n');
}

function toToolCall(block: Block): ToolCall {
  return {
    id: block.id ?? '',
    name: block.name ?? 'тул',
    argumentsText: JSON.stringify(block.input ?? {}),
  };
}

function parseArguments(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

// Anthropic считает input без кэша отдельно от прочитанного и записанного в кэш.
function toUsage(usage: AnthropicUsage | undefined): TokenUsage {
  const counts = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
    ...usage,
  };
  const fresh = counts.input_tokens + counts.cache_creation_input_tokens;
  return {
    inputTokens: fresh + counts.cache_read_input_tokens,
    inputCacheHitTokens: counts.cache_read_input_tokens,
    inputCacheMissTokens: fresh,
    outputTokens: counts.output_tokens,
    reasoningTokens: counts.output_tokens_details?.thinking_tokens ?? 0,
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

// Потоковый ответ OpenAI-совместимого API (этап 8d.2): `stream: true`, ответ приходит кусками SSE —
// строки `data: {...}` с приращением (delta) текста, рассуждения или аргументов тула, в конце
// `data: [DONE]`. Usage приходит в последнем куске, если попросить `stream_options.include_usage`.
//
// Здесь куски собираются в тот же объект chat.completion, что приходит без потока, — дальше
// харнесс разбирает ответ как обычно, а в трейсе лежит знакомый формат. Попутно замеряем три
// момента — первый токен, первый токен ответа и последний, — по ним видны фазы инференса.
// Формат кусков: https://api-docs.deepseek.com/api/create-chat-completion

import type { ResponseTiming } from './chatTypes.js';
import { appendReasoningDetails } from './reasoningDetails.js';
import { ModelProviderError } from './ModelProviderError.js';
import { wireErrorSchema } from './openAiWireSchema.js';

export interface StreamDelta {
  kind: 'reasoning' | 'answer';
  text: string;
}

export interface AssembledStream {
  body: Record<string, unknown>;
  timing: ResponseTiming;
}

interface ToolCallDraft {
  id: string;
  type: string;
  name: string;
  arguments: string;
}

interface Draft {
  id: string;
  model: string;
  content: string | null;
  reasoning: string | null;
  reasoningDetails: Record<string, unknown>[];
  toolCalls: ToolCallDraft[];
  finishReason: string | null;
  usage: unknown;
  // Вероятности токенов (этап 11) приходят в каждом куске — собираем по порядку.
  logprobs: { content: unknown[]; reasoning_content: unknown[] } | null;
}

interface ChunkDelta {
  content?: string | null;
  reasoning_content?: string | null;
  reasoning?: string | null;
  reasoning_details?: Record<string, unknown>[];
  tool_calls?: {
    index?: number;
    id?: string;
    type?: string;
    function?: { name?: string; arguments?: string };
  }[];
}

interface Chunk {
  id?: string;
  model?: string;
  choices?: {
    delta?: ChunkDelta;
    finish_reason?: string | null;
    logprobs?: { content?: unknown[] | null; reasoning_content?: unknown[] | null } | null;
  }[];
  usage?: unknown;
}

export async function readCompletionStream(
  stream: ReadableStream<Uint8Array>,
  startedAt: number,
  onDelta: (delta: StreamDelta) => void,
): Promise<AssembledStream> {
  const draft: Draft = {
    id: '',
    model: '',
    content: null,
    reasoning: null,
    reasoningDetails: [],
    toolCalls: [],
    finishReason: null,
    usage: null,
    logprobs: null,
  };
  const timing: ResponseTiming = {
    firstTokenMs: null,
    firstAnswerTokenMs: null,
    lastTokenMs: null,
    chunks: 0,
  };
  for await (const line of sseLines(stream)) {
    const chunk = parseDataLine(line);
    if (chunk === 'done') {
      break;
    }
    if (chunk !== null) {
      timing.chunks += 1;
      applyChunk(draft, chunk, mark(timing, startedAt), onDelta);
    }
  }
  if (draft.finishReason === null) {
    throw new ModelProviderError('Поток модели оборвался до finish_reason', null, null);
  }
  return { body: toCompletion(draft), timing };
}

// Декодер сохраняет байты незаконченного UTF-8 символа между сетевыми кусками.
async function* sseLines(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const bytes of stream) {
    buffer += decoder.decode(bytes, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    yield* lines;
  }
  buffer += decoder.decode();
  if (buffer !== '') {
    yield buffer;
  }
}

// Ошибка или повреждённый data-блок не должны превращать частичный ответ
// в успешный: иначе трейс и Evals засчитают то, что провайдер не завершил.
function parseDataLine(line: string): Chunk | 'done' | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('data:')) {
    return null;
  }
  const data = trimmed.slice('data:'.length).trim();
  if (data === '[DONE]') {
    return 'done';
  }
  if (data === '') {
    return null;
  }
  const chunk = parseChunkJson(data);
  if (chunk === null || typeof chunk !== 'object' || Array.isArray(chunk)) {
    throw new ModelProviderError('Непонятный формат события в потоке модели', null, chunk);
  }
  if ('error' in chunk) {
    const parsed = wireErrorSchema.safeParse(chunk);
    const message = parsed.success ? parsed.data.error.message : 'неизвестная ошибка';
    throw new ModelProviderError(`Ошибка в потоке модели: ${message}`, null, chunk);
  }
  return chunk;
}

function parseChunkJson(data: string): unknown {
  try {
    return JSON.parse(data);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new ModelProviderError(`Повреждённый JSON в потоке модели: ${detail}`, null, data);
  }
}

type Marker = (kind: 'reasoning' | 'answer') => void;

function mark(timing: ResponseTiming, startedAt: number): Marker {
  return (kind) => {
    const now = Math.round(performance.now() - startedAt);
    timing.firstTokenMs ??= now;
    if (kind === 'answer') {
      timing.firstAnswerTokenMs ??= now;
    }
    timing.lastTokenMs = now;
  };
}

function applyChunk(
  draft: Draft,
  chunk: Chunk,
  marker: Marker,
  onDelta: (delta: StreamDelta) => void,
): void {
  draft.id = chunk.id ?? draft.id;
  draft.model = chunk.model ?? draft.model;
  if (chunk.usage !== undefined && chunk.usage !== null) {
    draft.usage = chunk.usage;
  }
  const choice = chunk.choices?.[0];
  if (choice !== undefined) {
    draft.finishReason = choice.finish_reason ?? draft.finishReason;
    applyLogprobs(draft, choice.logprobs);
    applyDelta(draft, choice.delta ?? {}, marker, onDelta);
  }
}

function applyDelta(
  draft: Draft,
  delta: ChunkDelta,
  marker: Marker,
  onDelta: (delta: StreamDelta) => void,
): void {
  if (delta.reasoning_details !== undefined) {
    appendReasoningDetails(draft.reasoningDetails, delta.reasoning_details);
  }
  const reasoning = nonEmpty(delta.reasoning_content) ?? nonEmpty(delta.reasoning);
  if (reasoning !== null) {
    draft.reasoning = (draft.reasoning ?? '') + reasoning;
    marker('reasoning');
    onDelta({ kind: 'reasoning', text: reasoning });
  }
  const content = nonEmpty(delta.content);
  if (content !== null) {
    draft.content = (draft.content ?? '') + content;
    marker('answer');
    onDelta({ kind: 'answer', text: content });
  }
  if (delta.tool_calls !== undefined && delta.tool_calls.length > 0) {
    applyToolCalls(draft, delta.tool_calls);
    marker('answer');
  }
}

function applyLogprobs(
  draft: Draft,
  logprobs: NonNullable<Chunk['choices']>[number]['logprobs'],
): void {
  if (logprobs === undefined || logprobs === null) {
    return;
  }
  draft.logprobs ??= { content: [], reasoning_content: [] };
  draft.logprobs.content.push(...(logprobs.content ?? []));
  draft.logprobs.reasoning_content.push(...(logprobs.reasoning_content ?? []));
}

function nonEmpty(text: string | null | undefined): string | null {
  return typeof text === 'string' && text !== '' ? text : null;
}

// Вызов тула приходит частями: в первом куске id и имя, дальше — аргументы по кусочку.
function applyToolCalls(draft: Draft, parts: NonNullable<ChunkDelta['tool_calls']>): void {
  for (const part of parts) {
    const index = part.index ?? draft.toolCalls.length;
    const call = (draft.toolCalls[index] ??= { id: '', type: 'function', name: '', arguments: '' });
    call.id = part.id ?? call.id;
    call.type = part.type ?? call.type;
    call.name += part.function?.name ?? '';
    call.arguments += part.function?.arguments ?? '';
  }
}

function toCompletion(draft: Draft): Record<string, unknown> {
  const toolCalls = draft.toolCalls.filter((call) => call.id !== '' || call.name !== '');
  return {
    id: draft.id,
    object: 'chat.completion',
    model: draft.model,
    choices: [
      {
        index: 0,
        finish_reason: draft.finishReason,
        message: {
          role: 'assistant',
          content: draft.content,
          ...(draft.reasoning === null ? {} : { reasoning_content: draft.reasoning }),
          ...(draft.reasoningDetails.length === 0
            ? {}
            : { reasoning_details: draft.reasoningDetails }),
          ...(toolCalls.length === 0
            ? {}
            : {
                tool_calls: toolCalls.map((call) => ({
                  id: call.id,
                  type: call.type,
                  function: { name: call.name, arguments: call.arguments },
                })),
              }),
        },
        ...(draft.logprobs === null ? {} : { logprobs: draft.logprobs }),
      },
    ],
    ...(draft.usage === null ? {} : { usage: draft.usage }),
  };
}

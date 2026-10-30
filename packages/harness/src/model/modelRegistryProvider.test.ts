import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { harnessSettingsSchema, type ModelSettings } from '../settings/settingsSchema.js';
import { resolveRegistryModels } from '../settings/modelRegistry.js';
import { calculateCost } from '../tokenomics/calculateCost.js';
import { OpenAiCompatibleProvider } from './OpenAiCompatibleProvider.js';
import type { ModelRequest } from './chatTypes.js';
import { toWireMessages } from './toWireFormat.js';
import { fromWireMessages } from './fromWireFormat.js';
import { maskSecretHeaders } from './maskSecretHeaders.js';
import { HARNESS_USER_AGENT } from '../http/userAgent.js';

const settings = harnessSettingsSchema.parse(
  JSON.parse(await readFile(new URL('../../../../harness.config.json', import.meta.url), 'utf8')),
);
const request: ModelRequest = {
  messages: [{ role: 'user', content: 'test' }],
  tools: [],
  reasoningEffort: 'high',
};
const usage = {
  prompt_tokens: 100,
  prompt_cache_hit_tokens: 40,
  prompt_cache_miss_tokens: 60,
  completion_tokens: 20,
  completion_tokens_details: { reasoning_tokens: 5 },
};

function provider(model: ModelSettings): OpenAiCompatibleProvider {
  return new OpenAiCompatibleProvider(model, 'private-test-key', () =>
    Promise.reject(new Error('Network forbidden in this test')),
  );
}

function response(extra: Record<string, unknown> = {}): unknown {
  return {
    id: 'test-response',
    model: 'test',
    choices: [
      {
        index: 0,
        finish_reason: 'stop',
        message: { role: 'assistant', content: 'answer', reasoning_content: 'thinking', ...extra },
      },
    ],
    usage,
  };
}

describe('Провайдеры: DeepSeek остаётся прежним', () => {
  it('сохраняет полный формат HTTP-запроса и маскирование ключа', checkDeepSeekRequest);

  it('сохраняет usage и расчёт тарифа DeepSeek', checkDeepSeekReply);
});

describe('OpenRouter и локальный API', () => {
  it(
    'отправляет reasoning и заголовки OpenRouter, но не DeepSeek thinking',
    checkRouterRequestAndCost,
  );

  it('не отправляет Authorization локальной модели', checkLocalAuthorization);

  it(
    'собирает stream, кэш и подписанные reasoning-блоки для следующего tool round',
    checkSignedReasoningStream,
  );
});

function checkDeepSeekRequest(): void {
  const prepared = provider(settings.model).prepareRequest(request);
  assert.deepEqual(prepared, {
    method: 'POST',
    url: 'https://api.deepseek.com/chat/completions',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': HARNESS_USER_AGENT,
      Authorization: 'Bearer private-test-key',
    },
    body: {
      thinking: { type: 'enabled' },
      reasoning_effort: 'high',
      model: 'deepseek-flash',
      messages: [{ role: 'user', content: 'test' }],
      max_tokens: 8192,
      stream: true,
      stream_options: { include_usage: true },
    },
  });
  assert.equal(
    JSON.stringify(maskSecretHeaders(prepared.headers)).includes('private-test-key'),
    false,
  );
  const off = provider(settings.model).prepareRequest({ ...request, reasoningEffort: 'off' });
  assert.deepEqual(off.body['thinking'], { type: 'disabled' });
  assert.equal('reasoning_effort' in off.body, false);
}

function checkDeepSeekReply(): void {
  const reply = provider(settings.model).parseReply({
    status: 200,
    durationMs: 10,
    timing: null,
    body: response(),
  });
  assert.deepEqual(reply.usage, {
    inputTokens: 100,
    inputCacheHitTokens: 40,
    inputCacheMissTokens: 60,
    outputTokens: 20,
    reasoningTokens: 5,
  });
  assert.equal(reply.cost, undefined);
  const cost = calculateCost(
    reply.usage,
    settings.prices['deepseek-flash'],
    new Date('2026-10-30T12:00:00Z'),
  );
  assert.equal(cost?.tariffName, 'offPeak');
  assert.equal(cost?.total, 0.00002112);
  assert.equal(cost?.source, undefined);
}

function checkRouterRequestAndCost(): void {
  const model = resolveRegistryModels(settings).find((entry) => entry.key === 'glm-4.6');
  assert.ok(model);
  const prepared = provider(model.settings).prepareRequest(request);
  assert.equal(prepared.url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(prepared.headers['X-Title'], 'harness-visualization');
  const body = prepared.body;
  assert.deepEqual(body['reasoning'], { effort: 'high' });
  assert.equal('thinking' in body, false);
  const raw = {
    ...(response() as object),
    usage: {
      prompt_tokens: 100,
      completion_tokens: 20,
      prompt_tokens_details: { cached_tokens: 30 },
      cost: 0.0123,
    },
  };
  const reply = provider(model.settings).parseReply({
    status: 200,
    durationMs: 5,
    timing: null,
    body: raw,
  });
  assert.equal(reply.usage.inputCacheHitTokens, 30);
  assert.equal(reply.cost?.total, 0.0123);
  assert.equal(reply.cost?.source, 'provider');
  assert.equal(reply.cost?.output, null);
  const missing = provider(model.settings).parseReply({
    status: 200,
    durationMs: 5,
    timing: null,
    body: response(),
  });
  assert.equal(missing.cost, null);
}

function checkLocalAuthorization(): void {
  const model = resolveRegistryModels(settings).find((entry) => entry.key === 'qwen-local');
  assert.ok(model);
  const prepared = provider(model.settings).prepareRequest(request);
  assert.equal('Authorization' in prepared.headers, false);
  assert.equal('thinking' in (prepared.body as object), false);
}

async function checkSignedReasoningStream(): Promise<void> {
  const model = resolveRegistryModels(settings).find((entry) => entry.key === 'claude-sonnet');
  assert.ok(model);
  const wire = signedReasoningStream(model.settings.model);
  const streaming = new OpenAiCompatibleProvider(model.settings, 'private-test-key', () =>
    Promise.resolve(new Response(wire, { headers: { 'content-type': 'text/event-stream' } })),
  );
  const deltas: string[] = [];
  const raw = await streaming.send(streaming.prepareRequest(request), (delta) =>
    deltas.push(delta.text),
  );
  const reply = streaming.parseReply(raw);
  assert.equal(reply.reasoningText, 'thought');
  assert.equal(reply.cost?.total, 0.002);
  assert.equal(reply.toolCalls[0]?.name, 'read_file');
  assert.deepEqual(deltas, ['thought']);
  const details = [{ type: 'reasoning.text', index: 0, text: 'part two', signature: 'signed' }];
  assert.deepEqual(reply.reasoningDetails, details);
  const messages = toWireMessages(
    [
      {
        role: 'assistant',
        content: null,
        toolCalls: reply.toolCalls,
        reasoningContent: reply.reasoningText,
        reasoningDetails: reply.reasoningDetails,
      },
    ],
    'openrouter',
  );
  assert.deepEqual(messages[0]?.['reasoning_details'], details);
  assert.deepEqual(
    (fromWireMessages({ messages })[0] as { reasoningDetails: unknown }).reasoningDetails,
    details,
  );
}

function signedReasoningStream(model: string): string {
  const chunks = [
    {
      id: 'stream-1',
      model: model,
      choices: [
        {
          delta: {
            reasoning: 'thought',
            reasoning_details: [
              { type: 'reasoning.text', index: 0, text: 'part ', signature: null },
            ],
          },
        },
      ],
    },
    {
      choices: [
        {
          delta: {
            reasoning_details: [
              { type: 'reasoning.text', index: 0, text: 'two', signature: 'signed' },
            ],
            tool_calls: [
              { index: 0, id: 'call-1', function: { name: 'read_file', arguments: '{}' } },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
    },
    { choices: [], usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.002 } },
  ];
  return chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n';
}

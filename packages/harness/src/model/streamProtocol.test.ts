import assert from 'node:assert/strict';
import { it } from 'node:test';
import { requestModel } from '../agent/requestModel.js';
import { EventStream } from '../events/EventStream.js';
import type { HarnessEvent } from '../events/harnessEvents.js';
import { OpenAiCompatibleProvider } from './OpenAiCompatibleProvider.js';
import { ModelProviderError } from './ModelProviderError.js';
import {
  adapterModel,
  completionBody,
  completionEvents,
  fragmentedSse,
  fragmentedSseText,
} from './adapterTestFixtures.js';

it('SSE: чередующиеся тулы, reasoning, подписи, logprobs и usage после finish_reason', async () => {
  const provider = new OpenAiCompatibleProvider(adapterModel('claude-sonnet'), 'test-key', () =>
    Promise.resolve(fragmentedSse(toolStream())),
  );
  const deltas: string[] = [];
  const raw = await provider.send(
    provider.prepareRequest({ messages: [], tools: [], reasoningEffort: 'high' }),
    (delta) => deltas.push(delta.text),
  );
  const reply = provider.parseReply(raw);
  assert.equal(reply.reasoningText, 'Думаю 🧪');
  assert.deepEqual(deltas, ['Думаю ', '🧪']);
  assert.deepEqual(reply.toolCalls, [
    { id: 'read', name: 'read_file', argumentsText: '{"path":"план.md"}' },
    { id: 'list', name: 'list_files', argumentsText: '{"path":"."}' },
  ]);
  assert.deepEqual(reply.reasoningDetails, [
    { index: 0, type: 'reasoning.encrypted', data: 'opaque-data', signature: 'signed' },
  ]);
  assert.equal(reply.usage.inputCacheHitTokens, 40);
  assert.equal(reply.cost?.total, 0.003);
  assert.deepEqual(
    reply.logprobs?.reasoning.map((token) => token.token),
    ['Думаю', '🧪'],
  );
  assert.ok(raw.timing?.firstTokenMs !== null && raw.timing?.firstAnswerTokenMs !== null);
});

function toolStream(): unknown[] {
  const token = (text: string) => ({ token: text, logprob: -0.1 });
  return [
    {
      id: 'stream',
      model: 'claude-alias',
      choices: [
        {
          delta: {
            reasoning: 'Думаю ',
            reasoning_details: [
              { index: 0, type: 'reasoning.encrypted', data: 'opaque-', signature: null },
            ],
            tool_calls: [
              { index: 1, id: 'list', function: { name: 'list_', arguments: '{"path":' } },
            ],
          },
          logprobs: { reasoning_content: [token('Думаю')] },
        },
      ],
    },
    {
      choices: [
        {
          delta: {
            reasoning: '🧪',
            reasoning_details: [{ index: 0, data: 'data', signature: 'signed' }],
            tool_calls: [
              { index: 0, id: 'read', function: { name: 'read_file', arguments: '{"path":"план' } },
              { index: 1, function: { name: 'files', arguments: '"."}' } },
            ],
          },
          logprobs: { reasoning_content: [token('🧪')] },
        },
      ],
    },
    {
      choices: [
        {
          delta: { tool_calls: [{ index: 0, function: { arguments: '.md"}' } }] },
          finish_reason: 'tool_calls',
        },
      ],
    },
    {
      choices: [],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 20,
        prompt_tokens_details: { cached_tokens: 40 },
        cost: 0.003,
      },
    },
  ];
}

const VALID_EVENTS = completionEvents(completionBody('alias', { cost: 0.01 }));

for (const fault of [
  'in-band',
  'malformed',
  'truncated',
  'missing-usage',
  'empty',
  'primitive',
] as const) {
  it(`SSE ${fault}: неполный или ошибочный поток не становится успешным ответом`, async () => {
    const events: HarnessEvent[] = [];
    const stream = new EventStream('stream-failure');
    stream.subscribe((event) => events.push(event));
    const provider = new OpenAiCompatibleProvider(
      adapterModel('glm-4.6'),
      'private-stream-key',
      () => Promise.resolve(faultResponse(fault)),
    );
    await assert.rejects(
      requestModel(
        { messages: [], tools: [], reasoningEffort: 'high' },
        { provider, events: stream, prices: {} },
        { purpose: 'agentStep', iteration: 1 },
      ),
      ModelProviderError,
    );
    assert.deepEqual(
      events.map((event) => event.type),
      ['model_request', 'model_error'],
    );
    assert.equal(JSON.stringify(events).includes('private-stream-key'), false);
  });
}

function faultResponse(fault: string): Response {
  if (fault === 'empty') {
    return fragmentedSse([]);
  }
  if (fault === 'primitive') {
    return fragmentedSse([...VALID_EVENTS, 123]);
  }
  if (fault === 'in-band') {
    return fragmentedSse([
      ...VALID_EVENTS,
      { error: { message: 'Upstream disconnected', code: 502 } },
    ]);
  }
  if (fault === 'malformed') {
    return fragmentedSseText(
      VALID_EVENTS.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('') +
        'data: {broken}\n\ndata: [DONE]\n\n',
    );
  }
  if (fault === 'truncated') {
    return fragmentedSse([VALID_EVENTS[0], VALID_EVENTS[2]], false);
  }
  return fragmentedSse(VALID_EVENTS.slice(0, 2));
}

it('SSE: завершённый ответ с usage принимается при EOF без отдельного DONE', async () => {
  const provider = new OpenAiCompatibleProvider(adapterModel('glm-4.6'), '', () =>
    Promise.resolve(fragmentedSse(VALID_EVENTS, false)),
  );
  const raw = await provider.send(
    provider.prepareRequest({ messages: [], tools: [], reasoningEffort: 'high' }),
  );
  assert.equal(provider.parseReply(raw).text, 'Ответ 🧪');
});

it('SSE: DONE завершает чтение, последующие data-блоки не меняют ответ или стоимость', async () => {
  const wire =
    VALID_EVENTS.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('') +
    'data: [DONE]\n\ndata: {broken}\n\n';
  const provider = new OpenAiCompatibleProvider(adapterModel('glm-4.6'), '', () =>
    Promise.resolve(fragmentedSseText(wire)),
  );
  const raw = await provider.send(
    provider.prepareRequest({ messages: [], tools: [], reasoningEffort: 'high' }),
  );
  assert.equal(provider.parseReply(raw).cost?.total, 0.01);
});

it('SSE: разрыв транспорта даёт model_error, даже если часть ответа уже показана', async () => {
  let sent = false;
  const response = new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent) {
          controller.error(new TypeError('Mock socket closed'));
          return;
        }
        sent = true;
        controller.enqueue(
          new TextEncoder().encode(`data: ${JSON.stringify(VALID_EVENTS[0])}\n\n`),
        );
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } },
  );
  const provider = new OpenAiCompatibleProvider(adapterModel('glm-4.6'), '', () =>
    Promise.resolve(response),
  );
  const events: HarnessEvent[] = [];
  const stream = new EventStream('socket-error');
  stream.subscribe((event) => events.push(event));
  await assert.rejects(
    requestModel(
      { messages: [], tools: [], reasoningEffort: 'high' },
      { provider, events: stream, prices: {} },
      { purpose: 'agentStep', iteration: 1 },
    ),
    /Mock socket closed/,
  );
  assert.deepEqual(
    events.map((event) => event.type),
    ['model_request', 'model_error'],
  );
});

import assert from 'node:assert/strict';
import { it } from 'node:test';
import { requestModel } from '../agent/requestModel.js';
import { EventStream } from '../events/EventStream.js';
import type { HarnessEvent } from '../events/harnessEvents.js';
import { OpenAiCompatibleProvider } from './OpenAiCompatibleProvider.js';
import { ModelProviderError } from './ModelProviderError.js';
import type { ModelRequest } from './chatTypes.js';
import {
  adapterModel,
  adapterSettings,
  completionBody,
  completionEvents,
  fragmentedSse,
} from './adapterTestFixtures.js';

const REQUEST: ModelRequest = {
  messages: [{ role: 'user', content: 'Проверка' }],
  tools: [],
  reasoningEffort: 'high',
};
const MODELS = ['default', 'glm-4.6', 'gpt-mini', 'qwen-local'];

for (const key of MODELS) {
  for (const stream of [false, true]) {
    it(`${key}: ${stream ? 'SSE' : 'JSON'}, usage, кэш, модель-актор и стоимость`, async () => {
      await checkRoundTrip(key, stream);
    });
  }
  it(`${key}: HTTP 429 сохраняет ошибку, не создаёт успешный ответ и не раскрывает ключ`, async () => {
    const fixture = exchangeFixture(key, () =>
      Promise.resolve(
        new Response(JSON.stringify({ error: { message: 'Rate limit', code: 'rate_limit' } }), {
          status: 429,
        }),
      ),
    );
    await assert.rejects(
      requestModel(REQUEST, fixture.dependencies, { purpose: 'agentStep', iteration: 1 }),
      (error: unknown) =>
        error instanceof ModelProviderError &&
        error.status === 429 &&
        error.message.includes('Rate limit'),
    );
    checkFailedExchange(fixture.events);
    const failure = fixture.events.find((event) => event.type === 'model_error');
    assert.deepEqual(failure?.body, { error: { message: 'Rate limit', code: 'rate_limit' } });
  });
}

async function checkRoundTrip(key: string, stream: boolean): Promise<void> {
  const model = adapterModel(key);
  const body = completionBody('actual-provider-alias', {
    prompt_tokens_details: { cached_tokens: 30 },
    completion_tokens_details: { reasoning_tokens: 5 },
    cost: 0,
  });
  let requestCount = 0;
  const fixture = exchangeFixture(
    key,
    (_url, init) => {
      requestCount += 1;
      const sent = JSON.parse(init?.body as string) as Record<string, unknown>;
      assert.equal(sent.model, model.model);
      assert.equal(sent.stream, stream);
      assert.ok(init?.signal instanceof AbortSignal);
      assert.equal(new Headers(init?.headers).has('Authorization'), model.apiKeyVariable !== null);
      assert.equal(Object.hasOwn(sent, 'tools'), false);
      return Promise.resolve(stream ? fragmentedSse(completionEvents(body)) : Response.json(body));
    },
    stream,
  );
  const { reply, requestId } = await requestModel(REQUEST, fixture.dependencies, {
    purpose: 'agentStep',
    iteration: 1,
  });
  assert.equal(requestCount, 1);
  assert.equal(reply.text, 'Ответ 🧪');
  assert.equal(reply.model, 'actual-provider-alias');
  assert.deepEqual(reply.usage, {
    inputTokens: 100,
    inputCacheHitTokens: 30,
    inputCacheMissTokens: 70,
    outputTokens: 20,
    reasoningTokens: 5,
  });
  const requested = fixture.events.find((event) => event.type === 'model_request');
  const response = fixture.events.find((event) => event.type === 'model_response');
  assert.equal(requested?.modelIdentity?.model, model.model);
  assert.equal(response?.requestId, requestId);
  assert.equal(response?.reply.model, 'actual-provider-alias');
  assert.ok(response);
  checkAdapterCost(key, response);
  assert.equal(JSON.stringify(fixture.events).includes('private-contract-key'), false);
}

function checkAdapterCost(
  key: string,
  response: Extract<HarnessEvent, { type: 'model_response' }>,
): void {
  if (key === 'glm-4.6') {
    assert.equal(response.cost?.total, 0);
    assert.equal(response.cost?.source, 'provider');
  } else if (key === 'default') {
    assert.ok(response.cost !== null);
    assert.equal(response.cost?.source, undefined);
  } else {
    assert.equal(response.cost, null);
  }
}

function exchangeFixture(
  key: string,
  fetchImpl: ConstructorParameters<typeof OpenAiCompatibleProvider>[2],
  stream = false,
) {
  const settings = adapterSettings();
  const model = { ...adapterModel(key), stream };
  const events: HarnessEvent[] = [];
  const eventStream = new EventStream('adapter-contract');
  eventStream.subscribe((event) => events.push(event));
  return {
    events,
    dependencies: {
      provider: new OpenAiCompatibleProvider(model, 'private-contract-key', fetchImpl),
      events: eventStream,
      prices: settings.prices,
    },
  };
}

function checkFailedExchange(events: HarnessEvent[]): void {
  assert.deepEqual(
    events.map((event) => event.type),
    ['model_request', 'model_error'],
  );
  assert.equal(JSON.stringify(events).includes('private-contract-key'), false);
  const request = events[0];
  const failure = events[1];
  assert.ok(request?.type === 'model_request' && failure?.type === 'model_error');
  assert.equal(request.requestId, failure.requestId);
}

for (const failure of ['timeout', 'network', 'invalid-json', 'invalid-shape'] as const) {
  it(`ошибка ${failure} записывается по requestId без успешного model_response`, async () => {
    const fixture = exchangeFixture('gpt-mini', () => {
      if (failure === 'timeout') {
        return Promise.reject(new DOMException('test timeout', 'TimeoutError'));
      }
      if (failure === 'network') {
        return Promise.reject(new TypeError('mock network failure'));
      }
      return Promise.resolve(
        failure === 'invalid-json'
          ? new Response('upstream unavailable')
          : Response.json({ choices: [] }),
      );
    });
    await assert.rejects(
      requestModel(REQUEST, fixture.dependencies, { purpose: 'agentStep', iteration: 1 }),
      ModelProviderError,
    );
    checkFailedExchange(fixture.events);
  });
}

it('OpenAI: round trip тулов не переносит чужое reasoning, параметры reasoning и токенов изолированы', () => {
  const provider = exchangeFixture('gpt-mini', () =>
    Promise.reject(new Error('Запрос не ожидался')),
  ).dependencies.provider;
  const prepared = provider.prepareRequest({
    ...REQUEST,
    reasoningEffort: 'off',
    toolChoice: 'none',
    tools: [{ name: 'read_file', description: 'Чтение', parameters: { type: 'object' } }],
    messages: [
      {
        role: 'assistant',
        content: null,
        reasoningContent: 'foreign',
        reasoningDetails: [{ signature: 'foreign' }],
        toolCalls: [{ id: 'call', name: 'read_file', argumentsText: '{}' }],
      },
      { role: 'tool', toolCallId: 'call', content: 'Файл' },
    ],
  });
  assert.equal(prepared.body.reasoning_effort, 'none');
  assert.equal(prepared.body.max_completion_tokens, 8192);
  assert.equal(Object.hasOwn(prepared.body, 'max_tokens'), false);
  assert.equal(Object.hasOwn(prepared.body, 'thinking'), false);
  assert.equal(prepared.body.tool_choice, 'none');
  const messages = prepared.body.messages as Record<string, unknown>[];
  assert.equal(Object.hasOwn(messages[0]!, 'reasoning_content'), false);
  assert.equal(Object.hasOwn(messages[0]!, 'reasoning_details'), false);
  assert.deepEqual(messages[1], { role: 'tool', tool_call_id: 'call', content: 'Файл' });
});

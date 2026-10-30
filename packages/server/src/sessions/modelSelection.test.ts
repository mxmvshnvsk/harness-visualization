import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it } from 'node:test';
import Fastify from 'fastify';
import { readConfigFile, type HarnessEvent } from '@harness-visualization/harness';
import { registerSessionRoutes, type SessionOptionsResponse } from './sessionRoutes.js';
import { SessionRegistry } from './SessionRegistry.js';
import { PendingPermissions } from '../permissions/PendingPermissions.js';
import { PendingQuestions } from './PendingQuestions.js';
import { TraceCatalog } from '../traces/TraceCatalog.js';

it('API: публичный реестр, проверка выбора, две независимые модели и старые трейсы', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'harness-model-selection-'));
  const settings = await readConfigFile(new URL('../../../../', import.meta.url).pathname);
  settings.model.baseUrl = 'https://default.example/v1';
  settings.model.stream = false;
  settings.models = {
    alternate: {
      model: 'alternate',
      providerName: 'Test router',
      baseUrl: 'https://alternate.example/v1',
      apiKeyVariable: null,
      dialect: 'openrouter',
      stream: false,
    },
    missing: {
      model: 'missing',
      baseUrl: 'https://missing.example/v1',
      apiKeyVariable: 'HARNESS_SELECTION_ABSENT_KEY',
    },
  };
  settings.mcpServers = [];
  delete settings.search;
  settings.skills.directory = 'skills';
  const registry = new SessionRegistry();
  const app = Fastify();
  registerSessionRoutes(app, {
    projectRoot: root,
    loadedSettings: { settings, modelApiKey: 'private-default-key' },
    registry,
    permissions: new PendingPermissions(10),
    questions: new PendingQuestions(10),
  });
  const requests: { url: string; model: string; authorization: string | null }[] = [];
  context.mock.method(globalThis, 'fetch', (input: string | URL, init?: RequestInit) => {
    assert.equal(typeof init?.body, 'string');
    const body = JSON.parse(init?.body as string) as { model: string };
    requests.push({
      url: String(input),
      model: body.model,
      authorization: new Headers(init?.headers).get('authorization'),
    });
    return Promise.resolve(
      new Response(
        JSON.stringify({
          id: 'reply',
          model: body.model,
          choices: [
            { index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'done' } },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 3, cost: 0.004 },
        }),
        { headers: { 'content-type': 'application/json' } },
      ),
    );
  });
  try {
    const publicResponse = await app.inject({ method: 'GET', url: '/api/session-options' });
    const options = publicResponse.json<SessionOptionsResponse>();
    assert.equal(options.defaultModelKey, 'default');
    assert.equal(options.models.find((model) => model.key === 'missing')?.available, false);
    assert.equal(publicResponse.body.includes('private-default-key'), false);
    for (const modelKey of ['unknown', 'missing']) {
      const rejected = await app.inject({
        method: 'POST',
        url: '/api/sessions',
        payload: { question: 'test', modelKey },
      });
      assert.equal(rejected.statusCode, 400);
    }
    const orchestrated = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: { question: 'test', modelKey: 'alternate', orchestration: 'pipeline' },
    });
    assert.equal(orchestrated.statusCode, 400);
    assert.equal(registry.list().length, 0);
    const responses = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/api/sessions',
        payload: { question: 'default', demoProject: false },
      }),
      app.inject({
        method: 'POST',
        url: '/api/sessions',
        payload: { question: 'alternate', demoProject: false, modelKey: 'alternate' },
      }),
    ]);
    assert.deepEqual(
      responses.map((result) => result.statusCode),
      [201, 201],
    );
    assert.equal(await registry.waitForRunning(5000), 0);
    assert.equal(requests.length, 2);
    assert.deepEqual(
      requests.find((request) => request.model === 'deepseek-flash'),
      {
        url: 'https://default.example/v1/chat/completions',
        model: 'deepseek-flash',
        authorization: 'Bearer private-default-key',
      },
    );
    assert.deepEqual(
      requests.find((request) => request.model === 'alternate'),
      {
        url: 'https://alternate.example/v1/chat/completions',
        model: 'alternate',
        authorization: null,
      },
    );
    const alternate = registry.list().find((session) => session.model === 'alternate');
    assert.ok(alternate?.tracePath);
    const trace = await readFile(join(root, alternate.tracePath), 'utf8');
    assert.equal(trace.includes('private-default-key'), false);
    const events = trace
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as HarnessEvent);
    assert.equal(events[0]?.type, 'session_started');
    if (events[0]?.type === 'session_started') {
      assert.equal(events[0].modelKey, 'alternate');
    }
    const oldTrace = [
      {
        type: 'session_started',
        sessionId: 'old',
        sequence: 1,
        timestamp: '2026-01-01T00:00:00Z',
        providerName: 'deepseek',
        model: 'deepseek-flash',
      },
    ];
    await writeFile(
      join(root, 'old.jsonl'),
      oldTrace.map((event) => JSON.stringify(event)).join('\n'),
    );
    const catalog = new TraceCatalog(root);
    assert.equal((await catalog.read('old.jsonl'))?.skippedLines, 0);
    assert.equal(
      (await catalog.list()).find((item) => item.file === 'old.jsonl')?.model,
      'deepseek-flash',
    );
    assert.equal(settings.model.model, 'deepseek-flash');
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

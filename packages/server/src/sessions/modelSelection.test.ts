import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it, type TestContext } from 'node:test';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  readConfigFile,
  type HarnessEvent,
  type HarnessSettings,
} from '@harness-visualization/harness';
import { registerBranchRoutes } from './branchRoutes.js';
import { registerSessionRoutes, type SessionOptionsResponse } from './sessionRoutes.js';
import { SessionRegistry } from './SessionRegistry.js';
import { PendingPermissions } from '../permissions/PendingPermissions.js';
import { PendingQuestions } from './PendingQuestions.js';
import { TraceCatalog } from '../traces/TraceCatalog.js';

interface RecordedRequest {
  url: string;
  model: string;
  authorization: string | null;
}

interface ModelSelectionFixture {
  root: string;
  settings: HarnessSettings;
  registry: SessionRegistry;
  app: FastifyInstance;
  requests: RecordedRequest[];
}

it('API: назначения формы изолированы, null наследует сессию, default сохраняет DeepSeek', async (context) => {
  const fixture = await createFixture(context);
  context.after(async () => {
    await fixture.app.close();
    await rm(fixture.root, { recursive: true, force: true });
  });
  const { app, settings, requests, registry } = fixture;
  settings.orchestration.modelKey = 'alternate';
  settings.orchestration.pipeline.searchTool = 'list_files';
  const options = (
    await app.inject({ method: 'GET', url: '/api/session-options' })
  ).json<SessionOptionsResponse>();
  assert.equal(options.roleModels?.orchestrator, 'alternate');
  assert.equal(options.roleModels?.subagents.researcher?.reasoningEffort, 'low');
  await checkRejectedRoleAssignments(app);
  assert.equal(requests.length, 0);
  const responses = await Promise.all(
    [null, 'default'].map((orchestrator) =>
      app.inject({
        method: 'POST',
        url: '/api/sessions',
        payload: {
          question: 'test',
          modelKey: 'alternate',
          orchestration: 'pipeline',
          roleModels: { orchestrator, subagents: { researcher: null } },
        },
      }),
    ),
  );
  assert.deepEqual(
    responses.map((response) => response.statusCode),
    [201, 201],
  );
  assert.equal(await registry.waitForRunning(5000), 0);
  assert.deepEqual(requests.map((request) => request.model).sort(), [
    'alternate',
    'deepseek-flash',
  ]);
  assert.equal(
    requests.find((request) => request.model === 'deepseek-flash')?.authorization,
    'Bearer private-default-key',
  );
  assert.equal(settings.orchestration.modelKey, 'alternate');
  assert.equal(settings.subagents.agents.researcher?.modelKey, null);
  assert.ok(registry.list().every((session) => session.status === 'finished'));
});

it('API: публичный реестр, проверка выбора, две независимые модели и старые трейсы', async (context) => {
  const fixture = await createFixture(context);
  try {
    await checkPublicRegistry(fixture);
    await checkRejectedSelections(fixture);
    await checkIndependentSessions(fixture);
    const traceFile = await checkRecordedModel(fixture);
    await checkLegacyTrace(fixture.root);
    await checkBranchModels(fixture, traceFile);
    assert.equal(fixture.settings.model.model, 'deepseek-flash');
  } finally {
    await fixture.app.close();
    await rm(fixture.root, { recursive: true, force: true });
  }
});

async function checkRejectedRoleAssignments(app: FastifyInstance): Promise<void> {
  for (const roleModels of [
    { orchestrator: 'unknown' },
    { subagents: { unknown: null } },
    { orchestrator: 'missing' },
  ]) {
    const rejected = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: {
        question: 'test',
        modelKey: 'alternate',
        orchestration: 'pipeline',
        roleModels,
      },
    });
    assert.equal(rejected.statusCode, 400, rejected.body);
  }
}

async function createFixture(context: TestContext): Promise<ModelSelectionFixture> {
  const root = await mkdtemp(join(tmpdir(), 'harness-model-selection-'));
  const settings = await testSettings();
  const registry = new SessionRegistry();
  const app = Fastify();
  const options = {
    projectRoot: root,
    loadedSettings: { settings, modelApiKey: 'private-default-key' },
    registry,
    permissions: new PendingPermissions(10),
    questions: new PendingQuestions(10),
  };
  registerSessionRoutes(app, options);
  registerBranchRoutes(app, {
    ...options,
    catalog: new TraceCatalog(join(root, 'traces')),
    tracesDirectory: join(root, 'traces'),
  });
  const requests: RecordedRequest[] = [];
  mockModelTransport(context, requests);
  return { root, settings, registry, app, requests };
}

async function testSettings(): Promise<HarnessSettings> {
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
  return settings;
}

function mockModelTransport(context: TestContext, requests: RecordedRequest[]): void {
  context.mock.method(globalThis, 'fetch', (input: string | URL, init?: RequestInit) => {
    assert.equal(typeof init?.body, 'string');
    const body = JSON.parse(init?.body as string) as { model: string };
    requests.push({
      url: String(input),
      model: body.model,
      authorization: new Headers(init?.headers).get('authorization'),
    });
    const response = {
      id: 'reply',
      model: body.model,
      choices: [
        { index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'done' } },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 3, cost: 0.004 },
    };
    return Promise.resolve(
      new Response(JSON.stringify(response), { headers: { 'content-type': 'application/json' } }),
    );
  });
}

async function checkPublicRegistry({ app }: ModelSelectionFixture): Promise<void> {
  const response = await app.inject({ method: 'GET', url: '/api/session-options' });
  const options = response.json<SessionOptionsResponse>();
  assert.equal(options.defaultModelKey, 'default');
  assert.equal(options.models.find((model) => model.key === 'missing')?.available, false);
  assert.equal(response.body.includes('private-default-key'), false);
}

async function checkRejectedSelections({
  app,
  registry,
  settings,
}: ModelSelectionFixture): Promise<void> {
  for (const modelKey of ['unknown', 'missing']) {
    const rejected = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: { question: 'test', modelKey },
    });
    assert.equal(rejected.statusCode, 400);
  }
  settings.orchestration.modelKey = 'missing';
  const rejectedRole = await app.inject({
    method: 'POST',
    url: '/api/sessions',
    payload: { question: 'test', modelKey: 'alternate', orchestration: 'pipeline' },
  });
  assert.equal(rejectedRole.statusCode, 400);
  assert.match(
    rejectedRole.json<{ error: string }>().error,
    /orchestration.*HARNESS_SELECTION_ABSENT_KEY/u,
  );
  delete settings.orchestration.modelKey;
  assert.equal(registry.list().length, 0);
}

async function checkIndependentSessions({
  app,
  registry,
  requests,
}: ModelSelectionFixture): Promise<void> {
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
    responses.map((response) => response.statusCode),
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
}

async function checkRecordedModel({ root, registry }: ModelSelectionFixture): Promise<string> {
  const alternate = registry.list().find((session) => session.model === 'alternate');
  assert.ok(alternate?.tracePath);
  const trace = await readFile(join(root, alternate.tracePath), 'utf8');
  assert.equal(trace.includes('private-default-key'), false);
  const events = trace
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as HarnessEvent);
  const started = events[0];
  assert.equal(started?.type, 'session_started');
  if (started?.type === 'session_started') {
    assert.equal(started.modelKey, 'alternate');
  }
  const traceFile = alternate.tracePath.split('/').at(-1);
  assert.ok(traceFile);
  return traceFile;
}

async function checkLegacyTrace(root: string): Promise<void> {
  const oldTrace = {
    type: 'session_started',
    sessionId: 'old',
    sequence: 1,
    timestamp: '2026-01-01T00:00:00Z',
    providerName: 'deepseek',
    model: 'deepseek-flash',
  };
  await writeFile(join(root, 'old.jsonl'), JSON.stringify(oldTrace));
  const catalog = new TraceCatalog(root);
  assert.equal((await catalog.read('old.jsonl'))?.skippedLines, 0);
  assert.equal(
    (await catalog.list()).find((trace) => trace.file === 'old.jsonl')?.model,
    'deepseek-flash',
  );
}

async function checkBranchModels(
  { app, registry, requests }: ModelSelectionFixture,
  traceFile: string,
): Promise<void> {
  const options = await app.inject({
    method: 'GET',
    url: `/api/branch-options?traceFile=${traceFile}&step=1`,
  });
  assert.equal(options.statusCode, 200);
  assert.equal(options.json<{ sourceKey: string }>().sourceKey, 'alternate');
  for (const modelKey of [undefined, 'default']) {
    const branch = await app.inject({
      method: 'POST',
      url: '/api/sessions/branch',
      payload: {
        traceFile,
        step: 1,
        edit: { kind: 'replay' },
        ...(modelKey === undefined ? {} : { modelKey }),
      },
    });
    assert.equal(branch.statusCode, 201, branch.body);
    assert.equal(await registry.waitForRunning(5000), 0);
  }
  assert.deepEqual(
    requests.slice(2).map((request) => request.model),
    ['alternate', 'deepseek-flash'],
  );
  const missing = await app.inject({
    method: 'POST',
    url: '/api/sessions/branch',
    payload: { traceFile, step: 1, modelKey: 'missing', edit: { kind: 'replay' } },
  });
  assert.equal(missing.statusCode, 400);
  assert.equal(requests.length, 4);
}

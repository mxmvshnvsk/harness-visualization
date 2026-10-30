import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it, type TestContext } from 'node:test';
import type { HarnessEvent, OrchestrationMode } from '../events/harnessEvents.js';
import type { LoadedSettings } from '../settings/loadSettings.js';
import { harnessSettingsSchema } from '../settings/settingsSchema.js';
import { resolveRegistryModels } from '../settings/modelRegistry.js';
import { selectSessionModel } from '../settings/selectSessionModel.js';
import { prepareSessionRoleModels, createModelProviders } from './sessionRoleModels.js';
import { startSession, type SessionInput } from './startSession.js';

const CONFIG: unknown = JSON.parse(
  await readFile(new URL('../../../../harness.config.json', import.meta.url), 'utf8'),
);

interface RecordedRequest {
  model: string;
  authorization: string | null;
  body: Record<string, unknown>;
}

interface Fixture {
  root: string;
  loaded: LoadedSettings;
  requests: RecordedRequest[];
  events: HarnessEvent[];
}

it('проверяет ссылки ролей в реестре, сохраняя необязательность новых полей', () => {
  const legacy = harnessSettingsSchema.parse(CONFIG);
  delete legacy.orchestration.modelKey;
  delete legacy.subagents.agents.researcher!.modelKey;
  const settings = harnessSettingsSchema.parse(legacy);
  assert.equal(settings.orchestration.modelKey, undefined);
  assert.equal(settings.subagents.agents.researcher?.modelKey, undefined);
  settings.orchestration.modelKey = 'absent';
  assert.throws(() => resolveRegistryModels(settings), /orchestration.modelKey.*absent/u);
  settings.orchestration.modelKey = null;
  settings.subagents.agents.researcher!.modelKey = 'absent';
  assert.throws(() => resolveRegistryModels(settings), /subagents.agents.researcher.modelKey/u);
});

it('default остаётся исходной моделью после выбора модели сессии', async (context) => {
  const fixture = await createFixture(context);
  const selected = await selectSessionModel(fixture.loaded, 'session');
  const restored = await selectSessionModel(selected, 'default');
  assert.equal(restored.settings.model.model, 'deepseek-flash');
  assert.equal(restored.modelApiKey, 'private-default-key');
  assert.equal(restored.settings.context.compactionModel, 'legacy-compactor');
  assert.equal(selected.settings.context.compactionModel, null);
  const local = createModelProviders(selected, () => {
    throw new Error('Запрос не ожидался');
  });
  assert.equal(local.compactionProvider, local.provider);
});

it('старый конфиг: главный агент и оба субагента продолжают работать через DeepSeek', async (context) => {
  const fixture = await createFixture(context);
  await runFixture(fixture, null);
  assert.equal(fixture.requests.length, 4);
  assert.ok(fixture.requests.every((request) => request.model === 'deepseek-flash'));
  assert.ok(
    fixture.requests.every((request) => request.authorization === 'Bearer private-default-key'),
  );
  assert.deepEqual(fixture.requests[0]?.body.thinking, { type: 'enabled' });
  assert.equal(fixture.requests[0]?.body.reasoning_effort, 'high');
  checkTrace(fixture);
});

it('параллельные субагенты: назначение default и наследование выбранной модели сессии', async (context) => {
  const fixture = await createFixture(context);
  fixture.loaded.settings.subagents.agents.worker!.modelKey = 'default';
  fixture.loaded = await selectSessionModel(fixture.loaded, 'session');
  await runFixture(fixture, null);
  checkWorkerModels(fixture);
  assert.equal(fixture.loaded.settings.model.model, 'session-model');
  checkTrace(fixture);
});

for (const mode of ['superagent', 'hybrid'] as const) {
  it(`${mode}: своя модель оркестратора, модели исполнителей и доработка отчёта`, async (context) => {
    const fixture = await createFixture(context, mode);
    fixture.loaded.settings.orchestration.modelKey = 'orchestrator';
    fixture.loaded.settings.subagents.agents.worker!.modelKey = 'default';
    fixture.loaded = await selectSessionModel(fixture.loaded, 'session');
    await runFixture(fixture, mode);
    checkWorkerModels(fixture);
    const main = fixture.events.filter(
      (event) => event.type === 'model_request' && event.agentId === undefined,
    );
    assert.ok(main.length > 1);
    assert.ok(
      main.every(
        (event) =>
          event.type === 'model_request' && event.modelIdentity?.model === 'orchestrator-model',
      ),
    );
    const rounds = fixture.events.filter(
      (event) => event.type === 'subagent_finished' && event.subagentId === 'worker-1',
    );
    assert.equal(rounds.length, 2);
    assert.ok(
      fixture.requests.some(
        (request) =>
          request.model === 'deepseek-flash' &&
          request.authorization === 'Bearer private-default-key',
      ),
    );
    checkTrace(fixture);
  });
}

it('без назначений оркестратор и исполнители наследуют выбранную модель сессии', async (context) => {
  const fixture = await createFixture(context, 'superagent');
  const original = fixture.loaded;
  fixture.loaded = await selectSessionModel(original, 'session');
  await runFixture(fixture, 'superagent');
  assert.ok(fixture.requests.length > 4);
  assert.ok(fixture.requests.every((request) => request.model === 'session-model'));
  assert.ok(fixture.requests.every((request) => request.authorization === null));
  assert.equal(original.settings.model.model, 'deepseek-flash');
  assert.equal(original.modelApiKey, 'private-default-key');
  checkTrace(fixture);
});

it('пайплайн: итог отвечает моделью оркестратора, неиспользуемые роли не требуют ключей', async (context) => {
  const fixture = await createFixture(context, 'pipeline');
  fixture.loaded.settings.orchestration.modelKey = 'orchestrator';
  fixture.loaded.settings.orchestration.pipeline.researcher = 'inherited';
  fixture.loaded.settings.orchestration.pipeline.searchTool = 'list_files';
  fixture.loaded.settings.subagents.agents.worker!.modelKey = 'missing';
  fixture.loaded = await selectSessionModel(fixture.loaded, 'session');
  await runFixture(fixture, 'pipeline');
  assert.deepEqual(
    fixture.requests.map((request) => request.model),
    ['orchestrator-model'],
  );
  assert.ok(
    fixture.events.some(
      (event) => event.type === 'orchestration_finished' && event.status === 'done',
    ),
  );
});

it('активные назначения проверяются до запросов и создания трейса', async (context) => {
  const fixture = await createFixture(context);
  fixture.loaded.settings.subagents.agents.worker!.modelKey = 'missing';
  await assert.rejects(
    startSession(inputOf(fixture, null), hooksOf(fixture)),
    /worker.*HARNESS_ROLE_ABSENT_KEY/u,
  );
  assert.deepEqual(await readdir(fixture.root), []);
  fixture.loaded.settings.subagents.agents.worker!.modelKey = 'limited';
  await assert.rejects(prepareSessionRoleModels(inputOf(fixture, null)), /worker.*effort low/u);
  fixture.loaded.settings.subagents.agents.worker!.modelKey = null;
  fixture.loaded.settings.orchestration.modelKey = 'limited';
  await assert.rejects(
    prepareSessionRoleModels(inputOf(fixture, 'superagent')),
    /orchestration.*effort high/u,
  );
  assert.equal(fixture.requests.length, 0);
});

it('выключенные роли и сессия без демо не читают ключи назначений', async (context) => {
  const fixture = await createFixture(context);
  fixture.loaded.settings.subagents.agents.worker!.modelKey = 'missing';
  fixture.loaded.settings.orchestration.modelKey = 'missing';
  const disabled = { ...inputOf(fixture, null), subagents: false };
  assert.equal((await prepareSessionRoleModels(disabled)).subagents.size, 0);
  const blank = { ...inputOf(fixture, 'superagent'), demoProject: false };
  assert.equal((await prepareSessionRoleModels(blank)).orchestrator, null);
});

async function createFixture(
  context: TestContext,
  mode: OrchestrationMode | null = null,
): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), 'harness-role-models-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const settings = harnessSettingsSchema.parse(CONFIG);
  settings.model.baseUrl = 'https://default.example/v1';
  settings.model.stream = false;
  settings.context.compactionModel = 'legacy-compactor';
  settings.models = {
    session: localModel('session-model'),
    orchestrator: localModel('orchestrator-model'),
    missing: { ...localModel('missing'), apiKeyVariable: 'HARNESS_ROLE_ABSENT_KEY' },
    limited: {
      ...localModel('limited'),
      reasoningStyle: 'openai',
      defaultReasoningEffort: 'max',
      capabilities: { reasoningEfforts: ['max'] },
    },
  };
  settings.subagents.agents = {
    worker: {
      description: 'Исполнитель',
      instructions: '',
      tools: ['list_files'],
      maxIterations: 3,
      reasoningEffort: 'low',
    },
    inherited: {
      description: 'Без назначения',
      instructions: '',
      tools: ['list_files'],
      maxIterations: 3,
      reasoningEffort: 'low',
    },
  };
  settings.mcpServers = [];
  settings.workspace.seedDirectory = 'seed';
  settings.workspace.directory = 'workspace';
  delete settings.search;
  const fixture: Fixture = {
    root,
    loaded: { settings, modelApiKey: 'private-default-key' },
    requests: [],
    events: [],
  };
  mockTransport(context, fixture, mode);
  return fixture;
}

function localModel(model: string) {
  return { model, baseUrl: 'https://local.example/v1', apiKeyVariable: null, stream: false };
}

function inputOf(fixture: Fixture, orchestration: OrchestrationMode | null): SessionInput {
  return {
    loadedSettings: fixture.loaded,
    projectRoot: fixture.root,
    question: 'Проверка ролей',
    reasoningEffort: 'high',
    searchProvider: null,
    retrievalMode: 'tool',
    retrievalToolName: null,
    freshWorkspace: false,
    subagents: true,
    orchestration,
    demoProject: true,
    workspaceDirectory: null,
  };
}

function hooksOf(fixture: Fixture) {
  return {
    confirmAction: () => Promise.resolve({ approved: true, answeredBy: 'user' as const }),
    listeners: [(event: HarnessEvent) => fixture.events.push(event)],
    log: () => undefined,
  };
}

async function runFixture(fixture: Fixture, mode: OrchestrationMode | null): Promise<void> {
  const session = await startSession(inputOf(fixture, mode), hooksOf(fixture));
  const result = await session.completion;
  const errors = fixture.events.filter((event) => event.type === 'error');
  assert.equal(result.failed, false, JSON.stringify(errors));
}

function mockTransport(
  context: TestContext,
  fixture: Fixture,
  mode: OrchestrationMode | null,
): void {
  let mainCalls = 0;
  context.mock.method(globalThis, 'fetch', (_url: string | URL, init?: RequestInit) => {
    assert.equal(typeof init?.body, 'string');
    const body = JSON.parse(init?.body as string) as Record<string, unknown>;
    const messages = body.messages as { content: string }[];
    const model = String(body.model);
    fixture.requests.push({
      model,
      body,
      authorization: new Headers(init?.headers).get('authorization'),
    });
    const subagent = messages[0]?.content.startsWith('Ты — субагент');
    if (!subagent) {
      mainCalls += 1;
    }
    const calls = subagent ? [] : scriptCalls(mode, mainCalls);
    const message =
      calls.length > 0
        ? { role: 'assistant', content: null, tool_calls: calls }
        : { role: 'assistant', content: 'Готово' };
    return Promise.resolve(
      new Response(
        JSON.stringify({
          id: 'test-reply',
          model,
          choices: [{ index: 0, finish_reason: calls.length > 0 ? 'tool_calls' : 'stop', message }],
          usage: { prompt_tokens: 10, completion_tokens: 3 },
        }),
        { headers: { 'content-type': 'application/json' } },
      ),
    );
  });
}

function scriptCalls(mode: OrchestrationMode | null, step: number) {
  if (mode === 'pipeline') {
    return [];
  }
  if (mode === null) {
    return step === 1 ? delegateCalls() : [];
  }
  const delegateStep = mode === 'hybrid' ? 3 : 2;
  const reviewStep = mode === 'hybrid' ? 5 : 3;
  if (step === 1) {
    return [
      toolCall('plan_tasks', {
        tasks: [
          { title: 'Первое', agent: 'worker' },
          { title: 'Второе', agent: 'inherited' },
        ],
      }),
    ];
  }
  if (step === delegateStep) {
    return delegateCalls();
  }
  if (step === reviewStep) {
    return [
      toolCall('review_report', { subagentId: 'worker-1', verdict: 'rework', comment: 'Уточни' }),
    ];
  }
  if (step === reviewStep + 1) {
    return ['worker-1', 'inherited-2'].map((subagentId) =>
      toolCall('review_report', { subagentId, verdict: 'accept', comment: 'Принято' }),
    );
  }
  return [];
}

function delegateCalls() {
  return ['worker', 'inherited'].map((agent) =>
    toolCall('delegate_task', {
      agent,
      task: 'Проверь',
      taskId: agent === 'worker' ? 'task-1' : 'task-2',
    }),
  );
}

function toolCall(name: string, args: Record<string, unknown>) {
  const target = args.agent ?? args.subagentId ?? 'plan';
  assert.equal(typeof target, 'string');
  return {
    id: `${name}-${target as string}`,
    type: 'function',
    function: { name, arguments: JSON.stringify(args) },
  };
}

function checkWorkerModels(fixture: Fixture): void {
  const requests = fixture.events.filter((event) => event.type === 'model_request');
  const worker = requests.filter((event) => event.agentId === 'worker-1');
  const inherited = requests.filter((event) => event.agentId === 'inherited-2');
  assert.ok(worker.length > 0 && inherited.length > 0);
  assert.ok(worker.every((event) => event.modelIdentity?.model === 'deepseek-flash'));
  assert.ok(inherited.every((event) => event.modelIdentity?.model === 'session-model'));
}

function checkTrace(fixture: Fixture): void {
  const responses = fixture.events.filter((event) => event.type === 'model_response');
  const summary = fixture.events.find((event) => event.type === 'session_finished');
  assert.equal(summary?.modelRequests, responses.length);
  assert.equal(summary?.usage.inputTokens, responses.length * 10);
  const costs = responses.map((response) => response.cost);
  if (costs.some((cost) => cost === null)) {
    assert.equal(summary?.modelCost, null);
  } else {
    assert.equal(
      summary?.modelCost?.total,
      costs.reduce((total, cost) => total + (cost?.total ?? 0), 0),
    );
  }
  assert.equal(JSON.stringify(fixture.events).includes('private-default-key'), false);
}

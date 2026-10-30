import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it, type TestContext } from 'node:test';
import type { HarnessEvent } from '../events/harnessEvents.js';
import { adapterSettings, completionBody, fragmentedSse } from '../model/adapterTestFixtures.js';
import type { LoadedSettings } from '../settings/loadSettings.js';
import { selectSessionModel } from '../settings/selectSessionModel.js';
import { startSession, type SessionInput } from '../session/startSession.js';
import { branchSessionInput } from './branchInput.js';
import { continuationFacts } from './continuationFacts.js';

interface Fixture {
  root: string;
  loaded: LoadedSettings;
  requests: Record<string, unknown>[];
  failTarget: boolean;
}

for (const target of ['claude', 'openai', 'default']) {
  it(`ветка OpenRouter → ${target}: история тулов, reasoning, модель и только новая стоимость`, async (context) => {
    const fixture = await createFixture(context);
    const sourceInput = inputOf(fixture, await selectSessionModel(fixture.loaded, 'claude'));
    const source = await runInput(sourceInput);
    const snapshot = structuredClone(source);
    const selected = await selectSessionModel(fixture.loaded, target);
    const input = branchSessionInput({
      loadedSettings: selected,
      projectRoot: fixture.root,
      sourceTracePath: 'traces/source.jsonl',
      sourceEvents: source,
      step: 2,
      edit: { kind: 'replay' },
      workspaceDirectory: null,
      reasoningEffort: target === 'default' ? 'off' : 'high',
    });
    const events = await runInput(input);
    const sent = fixture.requests.at(-1)!;
    const history = sent.messages as Record<string, unknown>[];
    const assistant = history.find((message) => message.role === 'assistant');
    assert.equal(Object.hasOwn(assistant!, 'reasoning_details'), target === 'claude');
    assert.equal(Object.hasOwn(assistant!, 'reasoning_content'), false);
    assert.deepEqual(history.at(-1), {
      role: 'tool',
      tool_call_id: 'files',
      content: 'Папка . пуста',
    });
    assert.deepEqual(source, snapshot);
    const facts = continuationFacts(events);
    assert.equal(facts.modelRequests, 1);
    checkBranchCost(target, facts.costUsd);
    assert.equal(continuationFacts(source).modelRequests, 2);
    assert.equal(continuationFacts(source).costUsd, 0.14);
    assert.equal(
      events.find((event) => event.type === 'model_request')?.modelIdentity?.model,
      selected.settings.model.model,
    );
    assert.equal(
      events.find((event) => event.type === 'branch_started')?.historyAdapted,
      target !== 'claude',
    );
  });
}

it('старый DeepSeek-трейс без modelIdentity сохраняет reasoning и авторство исходной модели', async (context) => {
  const fixture = await createFixture(context);
  const source = await runInput(inputOf(fixture, fixture.loaded));
  const legacy = withoutModelMetadata(source);
  const input = branchSessionInput({
    loadedSettings: fixture.loaded,
    projectRoot: fixture.root,
    sourceTracePath: 'traces/legacy.jsonl',
    sourceEvents: legacy,
    step: 2,
    edit: { kind: 'replay' },
    workspaceDirectory: null,
  });
  const events = await runInput(input);
  const sent = fixture.requests.at(-1)!;
  const assistant = (sent.messages as Record<string, unknown>[]).find(
    (message) => message.role === 'assistant',
  );
  assert.equal(assistant?.reasoning_content, 'private-history-reasoning');
  assert.deepEqual(sent.thinking, { type: 'enabled' });
  const started = events.find((event) => event.type === 'branch_started');
  assert.equal(started?.sourceModel?.model, 'deepseek-flash');
  assert.equal(started?.historyAdapted, false);
  assert.equal(started?.historyActors?.[0]?.model.model, 'actual-deepseek-flash');
});

it('ошибка нового адаптера в ветке не превращается в успешное продолжение', async (context) => {
  const fixture = await createFixture(context);
  const source = await runInput(
    inputOf(fixture, await selectSessionModel(fixture.loaded, 'claude')),
  );
  fixture.failTarget = true;
  const input = branchSessionInput({
    loadedSettings: await selectSessionModel(fixture.loaded, 'openai'),
    projectRoot: fixture.root,
    sourceTracePath: 'traces/source.jsonl',
    sourceEvents: source,
    step: 2,
    edit: { kind: 'replay' },
    workspaceDirectory: null,
  });
  const events = await runInput(input, true);
  assert.equal(events.filter((event) => event.type === 'model_response').length, 0);
  assert.equal(events.find((event) => event.type === 'model_error')?.status, 429);
  assert.equal(continuationFacts(events).costUsd, null);
  assert.equal(continuationFacts(events).modelRequests, 1);
});

async function createFixture(context: TestContext): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), 'adapter-branches-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const settings = adapterSettings();
  settings.model.stream = true;
  settings.models = {
    claude: {
      model: 'anthropic/claude-test',
      baseUrl: 'https://router.test/v1',
      apiKeyVariable: null,
      dialect: 'openrouter',
      stream: true,
    },
    openai: {
      model: 'gpt-test',
      baseUrl: 'https://openai.test/v1',
      apiKeyVariable: null,
      dialect: 'openai',
      reasoningStyle: 'openai',
      stream: true,
    },
  };
  delete settings.search;
  const fixture: Fixture = {
    root,
    loaded: { settings, modelApiKey: 'private-branch-key' },
    requests: [],
    failTarget: false,
  };
  context.mock.method(globalThis, 'fetch', (_url: string | URL, init?: RequestInit) => {
    assert.equal(typeof init?.body, 'string');
    const body = JSON.parse(init?.body as string) as Record<string, unknown>;
    fixture.requests.push(body);
    if (fixture.failTarget && body.model === 'gpt-test') {
      return Promise.resolve(Response.json({ error: { message: 'Rate limit' } }, { status: 429 }));
    }
    return Promise.resolve(branchReply(body));
  });
  return fixture;
}

function branchReply(request: Record<string, unknown>): Response {
  const messages = request.messages as Record<string, unknown>[];
  const done = messages.at(-1)?.role === 'tool';
  const delta = done
    ? { content: 'Готово' }
    : {
        content: null,
        reasoning_content: 'private-history-reasoning',
        reasoning_details: [
          { index: 0, type: 'reasoning.encrypted', data: 'opaque', signature: 'signed' },
        ],
        tool_calls: [{ index: 0, id: 'files', function: { name: 'list_files', arguments: '{}' } }],
      };
  return fragmentedSse([
    {
      id: 'branch-reply',
      model: `actual-${String(request.model)}`,
      choices: [{ delta, finish_reason: done ? 'stop' : 'tool_calls' }],
    },
    { choices: [], usage: completionBody('unused', { cost: 0.07 }).usage },
  ]);
}

function inputOf(fixture: Fixture, loadedSettings: LoadedSettings): SessionInput {
  return {
    loadedSettings,
    projectRoot: fixture.root,
    question: 'Посмотри файлы',
    reasoningEffort: 'high',
    searchProvider: null,
    retrievalMode: 'tool',
    retrievalToolName: null,
    freshWorkspace: false,
    subagents: false,
    orchestration: null,
    demoProject: false,
    workspaceDirectory: null,
  };
}

async function runInput(input: SessionInput, failed = false): Promise<HarnessEvent[]> {
  const events: HarnessEvent[] = [];
  const session = await startSession(input, {
    confirmAction: () => Promise.resolve({ approved: true, answeredBy: 'user' }),
    listeners: [(event) => events.push(event)],
    log: () => undefined,
  });
  const result = await session.completion;
  assert.equal(
    result.failed,
    failed,
    JSON.stringify(events.filter((event) => event.type === 'error')),
  );
  const written = await readFile(join(input.projectRoot, result.tracePath), 'utf8');
  assert.equal(written.includes('private-branch-key'), false);
  return events;
}

function withoutModelMetadata(events: HarnessEvent[]): HarnessEvent[] {
  const legacy = structuredClone(events);
  for (const event of legacy) {
    if (event.type === 'model_request') {
      delete event.modelIdentity;
    }
    if (event.type === 'session_started') {
      delete event.modelKey;
      delete event.modelLabel;
      delete event.dialect;
    }
  }
  return legacy;
}

function checkBranchCost(target: string, cost: number | null): void {
  if (target === 'default') {
    assert.ok(cost !== null && cost > 0 && cost < 0.07);
    return;
  }
  assert.equal(cost, target === 'claude' ? 0.07 : null);
}

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { it, type TestContext } from 'node:test';
import Fastify from 'fastify';
import { readConfigFile } from '@harness-visualization/harness';
import type { EvalReport } from '@harness-visualization/harness/evals';
import { TraceCatalog } from '../traces/TraceCatalog.js';
import { registerEvalRoutes, type EvalsResponse } from './evalRoutes.js';

const executeFile = promisify(execFile);
const EVAL_CLI = fileURLToPath(new URL('../../../harness/dist/cli/mainEval.js', import.meta.url));
const PROJECT_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

const TEST_SET = {
  name: 'Model selection',
  description: 'Тестовый транспорт',
  tasks: [
    {
      id: 'test',
      question: 'question',
      origin: 'test',
      checks: [
        { kind: 'answerIncludes', anyOf: ['done'] },
        { kind: 'judge', rubric: 'ответь done' },
      ],
    },
  ],
};

interface RecordedRequest {
  model: string;
  judge: boolean;
  stream: boolean;
  url: string;
  reasoning?: { effort: string };
  thinking?: { type: string };
  maxCompletionTokens?: number;
}

it('CLI сравнивает две модели с одним судьёй и отдаёт метаданные через API', async (context) => {
  const root = await createFixture(context);
  await runEval(root, ['--models', 'alpha,beta', '--judge-model', 'default']);
  const report = await readReport(root);
  assert.deepEqual(
    report.configs.map((config) => config.name),
    ['tool@alpha', 'tool@beta'],
  );
  assert.deepEqual(
    report.configs.map((config) => config.model?.model),
    ['model-alpha', 'model-beta'],
  );
  assert.equal(report.judgeModel?.model, 'deepseek-flash');
  assert.deepEqual(
    report.results.map((trial) => trial.passed),
    [true, true],
  );
  assert.deepEqual(
    report.results.map((trial) => trial.actualModels),
    [['actual-model-alpha'], ['actual-model-beta']],
  );
  const requests = await readRequests(root);
  assert.deepEqual(
    requests.filter((request) => !request.judge).map((request) => request.model),
    ['model-alpha', 'model-beta'],
  );
  assert.deepEqual(
    requests.filter((request) => request.judge).map((request) => request.model),
    ['deepseek-flash', 'deepseek-flash'],
  );
  const publicReport = await readReportThroughApi(root);
  assert.equal(publicReport.reports[0]?.model.includes('Alpha'), true);
  assert.equal(publicReport.reports[0]?.model.includes('Beta'), true);
  assert.equal(JSON.stringify(report).includes('modelApiKey'), false);
});

it('старый CLI без выбора модели сохраняет имена и отключение судьи', async (context) => {
  const root = await createFixture(context);
  await runEval(root, ['--no-judge']);
  const report = await readReport(root);
  assert.equal(report.model, 'deepseek-flash');
  assert.equal(report.configs[0]?.name, 'tool');
  assert.equal(report.judgeModel, null);
  assert.equal(report.results[0]?.passed, null);
  assert.deepEqual(
    (await readRequests(root)).map((request) => request.model),
    ['deepseek-flash'],
  );
});

it('неподдерживаемый effort останавливает CLI до первого обращения к API', async (context) => {
  const root = await createFixture(context);
  await assert.rejects(
    runEval(root, ['--models', 'alpha,limited', '--effort', 'max']),
    /не поддерживается/,
  );
  assert.deepEqual(await readRequests(root), []);
});

it('именованные модели без судьи не требуют ключа DeepSeek', async (context) => {
  const root = await createFixture(context);
  const configPath = join(root, 'harness.config.json');
  const settings = JSON.parse(await readFile(configPath, 'utf8')) as {
    model: { apiKeyVariable: string | null };
  };
  settings.model.apiKeyVariable = 'HARNESS_EVALS_ABSENT_KEY';
  await writeFile(configPath, JSON.stringify(settings));
  await runEval(root, ['--models', 'alpha,beta', '--no-judge']);
  assert.deepEqual(
    (await readRequests(root)).map((request) => request.model),
    ['model-alpha', 'model-beta'],
  );
});

it('несовместимая модель судьи отклоняется до первого запроса', async (context) => {
  const root = await createFixture(context);
  await assert.rejects(
    runEval(root, ['--models', 'alpha,beta', '--judge-model', 'limited']),
    /effort off не поддерживается/,
  );
  assert.deepEqual(await readRequests(root), []);
});

it('Evals: разные диалекты, streaming, тарифы и кэш остаются раздельными', async (context) => {
  const root = await createFixture(context);
  await runEval(root, ['--models', 'alpha,beta', '--judge-model', 'default']);
  const report = await readReport(root);
  const requests = await readRequests(root);
  const alpha = requests.find((request) => request.model === 'model-alpha')!;
  const beta = requests.find((request) => request.model === 'model-beta')!;
  assert.equal(alpha.stream, true);
  assert.deepEqual(alpha.reasoning, { effort: 'high' });
  assert.equal(alpha.thinking, undefined);
  assert.equal(beta.stream, false);
  assert.equal(beta.maxCompletionTokens, 8192);
  assert.ok(
    requests
      .filter((request) => request.judge)
      .every((request) => request.thinking?.type === 'disabled'),
  );
  assert.equal(report.results[0]?.costUsd, 0.004);
  assert.equal(report.results[1]?.costUsd, null);
  assert.ok(report.results.every((trial) => trial.cacheWarm));
  assert.equal(report.judgeModel?.model, 'deepseek-flash');
});

for (const fault of ['http', 'stream'] as const) {
  it(`Evals: ошибка ${fault} одного адаптера не засчитывается как успешная попытка`, async (context) => {
    const root = await createFixture(context);
    const environment =
      fault === 'http'
        ? { HARNESS_MOCK_FAIL_MODEL: 'model-beta' }
        : { HARNESS_MOCK_STREAM_ERROR: 'true' };
    await runEval(root, ['--models', 'alpha,beta', '--judge-model', 'default'], environment);
    const report = await readReport(root);
    const failedModel = fault === 'http' ? 'tool@beta' : 'tool@alpha';
    const failed = report.results.find((trial) => trial.config === failedModel)!;
    assert.equal(failed.failed, true);
    assert.equal(failed.passed, false);
    assert.equal(failed.modelRequests, 1);
    assert.equal(failed.costUsd, null);
    const healthy = report.results.find((trial) => trial.config !== failedModel)!;
    assert.equal(healthy.failed, false);
    assert.equal(healthy.passed, true);
    const trace = await readFile(join(root, failed.tracePath), 'utf8');
    assert.ok(trace.includes('model_error'));
    assert.equal(trace.includes('model_response'), false);
  });
}

async function createFixture(context: TestContext): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'harness-eval-models-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const settings = await readConfigFile(PROJECT_ROOT);
  settings.model.apiKeyVariable = null;
  settings.model.stream = false;
  settings.mcpServers = [];
  delete settings.search;
  settings.skills.manual = [];
  settings.models = {
    alpha: {
      model: 'model-alpha',
      label: 'Alpha',
      baseUrl: 'https://alpha.test/v1',
      apiKeyVariable: null,
      dialect: 'openrouter',
      stream: true,
    },
    beta: {
      model: 'model-beta',
      label: 'Beta',
      baseUrl: 'https://beta.test/v1',
      apiKeyVariable: null,
      dialect: 'openai',
      reasoningStyle: 'openai',
      outputTokenParameter: 'max_completion_tokens',
      stream: false,
    },
    limited: {
      model: 'limited',
      baseUrl: 'https://limited.test/v1',
      apiKeyVariable: null,
      reasoningStyle: 'openai',
      defaultReasoningEffort: 'low',
      capabilities: { reasoningEfforts: ['low', 'high'] },
    },
  };
  await mkdir(join(root, settings.workspace.seedDirectory), { recursive: true });
  await mkdir(join(root, 'evals'));
  await writeFile(join(root, 'harness.config.json'), JSON.stringify(settings));
  await writeFile(join(root, 'evals', 'test.json'), JSON.stringify(TEST_SET));
  await writeFile(
    join(root, 'transport.mjs'),
    await readFile(new URL('../../src/evals/modelEvalsTransport.mjs', import.meta.url), 'utf8'),
  );
  return root;
}

async function runEval(
  root: string,
  argumentsList: string[],
  environment: NodeJS.ProcessEnv = {},
): Promise<void> {
  await executeFile(
    process.execPath,
    [
      '--import',
      join(root, 'transport.mjs'),
      EVAL_CLI,
      '--set',
      'evals/test.json',
      '--configs',
      'tool',
      '--trials',
      '1',
      ...argumentsList,
    ],
    { cwd: root, env: { ...process.env, ...environment } },
  );
}

async function readReport(root: string): Promise<EvalReport> {
  const directory = join(root, 'traces', 'evals');
  const files = await readdir(directory);
  assert.equal(files.length, 1);
  return JSON.parse(await readFile(join(directory, files[0] ?? ''), 'utf8')) as EvalReport;
}

async function readRequests(root: string): Promise<RecordedRequest[]> {
  try {
    const contents = await readFile(join(root, 'requests.jsonl'), 'utf8');
    return contents
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as RecordedRequest);
  } catch {
    return [];
  }
}

async function readReportThroughApi(root: string): Promise<EvalsResponse> {
  const app = Fastify();
  registerEvalRoutes(app, {
    projectRoot: root,
    reportSources: [{ directory: join(root, 'traces', 'evals'), example: false }],
    catalog: new TraceCatalog(join(root, 'traces')),
  });
  try {
    const response = await app.inject({ method: 'GET', url: '/api/evals' });
    assert.equal(response.statusCode, 200);
    return response.json<EvalsResponse>();
  } finally {
    await app.close();
  }
}

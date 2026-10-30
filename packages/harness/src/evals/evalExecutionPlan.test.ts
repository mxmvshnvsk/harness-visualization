import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { it } from 'node:test';
import { harnessSettingsSchema } from '../settings/settingsSchema.js';
import { prepareEvalModels, parseEvalModelKeys, resolveEvalVariants } from './evalExecutionPlan.js';
import { evalSetSchema } from './evalSet.js';

const rawConfig: unknown = JSON.parse(
  await readFile(new URL('../../../../harness.config.json', import.meta.url), 'utf8'),
);
const questions = evalSetSchema.parse({
  name: 'test',
  description: 'test',
  tasks: [
    {
      id: 'test',
      question: 'question',
      origin: 'test',
      checks: [{ kind: 'answerIncludes', anyOf: ['done'] }],
    },
  ],
});

function loadedSettings() {
  const settings = harnessSettingsSchema.parse(rawConfig);
  settings.models = {
    local: {
      model: 'local-test',
      label: 'Локальная',
      baseUrl: 'https://local.test/v1',
      apiKeyVariable: null,
    },
    limited: {
      model: 'limited-test',
      baseUrl: 'https://limited.test/v1',
      apiKeyVariable: null,
      dialect: 'openrouter',
      defaultReasoningEffort: 'low',
      capabilities: { reasoningEfforts: ['low', 'high'] },
    },
    missing: {
      model: 'missing-test',
      baseUrl: 'https://missing.test/v1',
      apiKeyVariable: 'HARNESS_EVALS_ABSENT_KEY',
    },
  };
  return { settings, modelApiKey: 'test-default-key' };
}

it('старый вызов сохраняет имена конфигураций и модель DeepSeek', async () => {
  const loaded = loadedSettings();
  const configs = resolveEvalVariants(questions, null);
  const plan = await prepareEvalModels({ loadedSettings: loaded, configs, modelKeys: null });
  assert.deepEqual(
    plan.map((config) => config.name),
    ['tool', 'auto'],
  );
  assert.equal(plan[0]?.loadedSettings.settings.model, loaded.settings.model);
  assert.equal(plan[0]?.reasoningEffort, loaded.settings.model.defaultReasoningEffort);
});

it('матрица моделей и вариантов использует отдельные настройки и сохраняет метаданные', async () => {
  const loaded = loadedSettings();
  const configs = resolveEvalVariants(questions, ['tool', 'auto']);
  const plan = await prepareEvalModels({
    loadedSettings: loaded,
    configs,
    modelKeys: ['default', 'local'],
  });
  assert.deepEqual(
    plan.map((config) => config.name),
    ['tool@default', 'auto@default', 'tool@local', 'auto@local'],
  );
  assert.equal(plan[2]?.model.label, 'Локальная');
  assert.equal(plan[2]?.loadedSettings.modelApiKey, '');
  assert.equal(plan[2]?.loadedSettings.settings.context.compactionModel, null);
  assert.equal(loaded.settings.model.model, 'deepseek-flash');
  assert.equal(loaded.modelApiKey, 'test-default-key');
});

it('одна явно выбранная модель сохраняет имена для сравнения со старыми отчётами', async () => {
  const configs = resolveEvalVariants(questions, ['tool']);
  const plan = await prepareEvalModels({
    loadedSettings: loadedSettings(),
    configs,
    modelKeys: ['local'],
  });
  assert.equal(plan[0]?.name, 'tool');
  assert.equal(plan[0]?.model.key, 'local');
});

it('неизвестные модели и отсутствие ключа отвергаются до попыток', async () => {
  const loaded = loadedSettings();
  const configs = resolveEvalVariants(questions, ['tool']);
  await assert.rejects(
    prepareEvalModels({ loadedSettings: loaded, configs, modelKeys: ['local', 'unknown'] }),
    /Неизвестная модель/,
  );
  await assert.rejects(
    prepareEvalModels({ loadedSettings: loaded, configs, modelKeys: ['missing'] }),
    /HARNESS_EVALS_ABSENT_KEY/,
  );
});

it('effort не понижается молча и проверяется также для вариантов арены', async () => {
  const loaded = loadedSettings();
  const configs = resolveEvalVariants(questions, ['tool']);
  await assert.rejects(
    prepareEvalModels({
      loadedSettings: loaded,
      configs,
      modelKeys: ['limited'],
      reasoningEffort: 'max',
    }),
    /не поддерживается/,
  );
  const arena = { ...questions, kind: 'arena' as const };
  const arenaConfigs = resolveEvalVariants(arena, ['tests-max']);
  await assert.rejects(
    prepareEvalModels({ loadedSettings: loaded, configs: arenaConfigs, modelKeys: ['limited'] }),
    /не поддерживается/,
  );
  const overridden = await prepareEvalModels({
    loadedSettings: loaded,
    configs: arenaConfigs,
    modelKeys: ['limited'],
    reasoningEffort: 'high',
  });
  assert.equal(overridden[0]?.reasoningEffort, 'high');
});

it('список моделей не допускает пустых и повторяющихся ключей', () => {
  assert.deepEqual(parseEvalModelKeys('default, local'), ['default', 'local']);
  assert.throws(() => parseEvalModelKeys('local,'), /непустые/);
  assert.throws(() => parseEvalModelKeys('local,local'), /повторяться/);
});

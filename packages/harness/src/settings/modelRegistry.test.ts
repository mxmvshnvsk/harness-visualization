import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { harnessSettingsSchema } from './settingsSchema.js';
import { loadSettings } from './loadSettings.js';
import { modelOptions, resolveRegistryModels } from './modelRegistry.js';
import { selectSessionModel, validateModelEffort } from './selectSessionModel.js';

const config: unknown = JSON.parse(
  await readFile(new URL('../../../../harness.config.json', import.meta.url), 'utf8'),
);

describe('Реестр моделей и совместимость настроек', () => {
  it('старый конфиг без реестра возвращает исходную модель без изменений', checkLegacyConfig);

  it('не переносит beta URL и logprobs DeepSeek в другие провайдеры', checkProviderIsolation);

  it('отвергает ошибочные ссылки и зарезервированное имя', checkInvalidRegistry);

  it('показывает локальную модель без ключа и не раскрывает секреты', checkPublicLocalModel);

  it(
    'выбирает модель в копии настроек, проверяет неизвестный ключ и effort',
    checkSessionSelection,
  );

  it(
    'сервер может загрузить конфиг без ключа модели, CLI по-прежнему требует ключ',
    checkOptionalServerKey,
  );
});

function checkLegacyConfig(): void {
  const settings = harnessSettingsSchema.parse(config);
  delete settings.models;
  delete settings.providers;
  const entries = resolveRegistryModels(settings);
  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.key, 'default');
  assert.equal(entries[0]?.settings, settings.model);
  assert.equal(entries[0]?.settings.modelKey, undefined);
  assert.equal(entries[0]?.settings.dialect, undefined);
}

function checkProviderIsolation(): void {
  const settings = harnessSettingsSchema.parse(config);
  settings.model.topLogprobs = 10;
  const glm = resolveRegistryModels(settings).find((model) => model.key === 'glm-4.6');
  assert.equal(glm?.settings.baseUrl, 'https://openrouter.ai/api/v1');
  assert.equal(glm?.settings.reasoningStyle, 'openrouter');
  assert.equal(glm?.settings.topLogprobs, 0);
  assert.equal(glm?.settings.prefixCompletionBaseUrl, null);
  assert.deepEqual(glm?.settings.requestExtras, {});
}

function checkInvalidRegistry(): void {
  const settings = harnessSettingsSchema.parse(config);
  settings.models = { bad: { model: 'test', provider: 'missing' } };
  assert.throws(() => resolveRegistryModels(settings), /нет провайдера missing/u);
  settings.models = { default: { model: 'test' } };
  assert.throws(() => resolveRegistryModels(settings), /зарезервировано/u);
  settings.models = { bad: { model: 'test', baseUrl: 'https://example.com/v1' } };
  assert.throws(() => resolveRegistryModels(settings), /apiKeyVariable/u);
}

function checkPublicLocalModel(): void {
  const settings = harnessSettingsSchema.parse(config);
  settings.models = {
    local: { model: 'local', baseUrl: 'http://localhost:11434/v1', apiKeyVariable: null },
  };
  const local = modelOptions(settings).find((entry) => entry.key === 'local');
  assert.equal(local?.available, true);
  assert.deepEqual(local?.reasoningEfforts, []);
  assert.equal(local?.priceSource, 'unknown');
  assert.equal(local?.capabilities.cache, undefined);
  assert.equal(local !== undefined && 'settings' in local, false);
}

async function checkSessionSelection(): Promise<void> {
  const settings = harnessSettingsSchema.parse(config);
  settings.models = {
    local: { model: 'local', baseUrl: 'http://localhost:11434/v1', apiKeyVariable: null },
  };
  const loaded = { settings, modelApiKey: 'original-key' };
  const selected = await selectSessionModel(loaded, 'local');
  assert.equal(selected.settings.model.model, 'local');
  assert.equal(selected.modelApiKey, '');
  assert.equal(loaded.settings.model.model, 'deepseek-flash');
  assert.equal(loaded.modelApiKey, 'original-key');
  assert.equal((await selectSessionModel(loaded, 'default')).settings, settings);
  await assert.rejects(selectSessionModel(loaded, 'missing'), /Неизвестная модель/u);
  const full = { settings: harnessSettingsSchema.parse(config), modelApiKey: '' };
  assert.throws(() => validateModelEffort(full, 'gpt-mini', 'max'), /не поддерживается/u);
}

async function checkOptionalServerKey(): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'harness-registry-'));
  const settings = harnessSettingsSchema.parse(config);
  settings.model.apiKeyVariable = 'HARNESS_REGISTRY_ABSENT_KEY';
  delete settings.models;
  delete settings.providers;
  try {
    await writeFile(join(root, 'harness.config.json'), JSON.stringify(settings));
    assert.equal((await loadSettings(root, { requireModelKey: false })).modelApiKey, '');
    await assert.rejects(loadSettings(root), /HARNESS_REGISTRY_ABSENT_KEY/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

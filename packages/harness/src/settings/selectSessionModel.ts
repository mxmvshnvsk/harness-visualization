import { readModelApiKey, type LoadedSettings } from './loadSettings.js';
import { DEFAULT_MODEL_KEY, modelOptions, resolveRegistryModels } from './modelRegistry.js';
import type { ReasoningEffort } from '../model/chatTypes.js';

// Отдельная копия настроек на сессию: параллельные запуски не меняют модель друг другу.
export async function selectSessionModel(
  loaded: LoadedSettings,
  key: string,
): Promise<LoadedSettings> {
  const model = resolveRegistryModels(loaded.settings).find((entry) => entry.key === key);
  if (model === undefined) {
    throw new Error(`Неизвестная модель: ${key}`);
  }
  const modelApiKey =
    key === DEFAULT_MODEL_KEY && loaded.modelApiKey !== ''
      ? loaded.modelApiKey
      : await readModelApiKey(model.settings.apiKeyVariable);
  if (key === DEFAULT_MODEL_KEY) {
    return { ...loaded, modelApiKey };
  }
  return {
    modelApiKey,
    settings: {
      ...loaded.settings,
      model: model.settings,
      // Имя compactionModel относится к провайдеру по умолчанию. Для выбранной
      // модели служебные запросы идут в неё же, а не в чужую модель этого API.
      context: { ...loaded.settings.context, compactionModel: null },
    },
  };
}

export function validateModelEffort(
  loaded: LoadedSettings,
  key: string,
  effort: ReasoningEffort,
): void {
  const model = modelOptions(loaded.settings).find((entry) => entry.key === key);
  if (
    model !== undefined &&
    model.reasoningEfforts.length > 0 &&
    !model.reasoningEfforts.includes(effort)
  ) {
    throw new Error(`Модель ${model.label}: effort ${effort} не поддерживается`);
  }
}

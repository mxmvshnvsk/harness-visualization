// Реестр не наследует DeepSeek-специфичные поля: beta URL, logprobs и thinking
// нельзя случайно отправить другому провайдеру. Старый model возвращаем без изменений.
import { REASONING_EFFORTS, type ReasoningEffort } from '../model/chatTypes.js';
import { modelSettingsSchema, type HarnessSettings, type ModelSettings } from './settingsSchema.js';
import type { ModelDialect } from './modelRegistrySchema.js';

export const DEFAULT_MODEL_KEY = 'default';

export interface RegisteredModel {
  key: string;
  label: string;
  settings: ModelSettings;
  capabilities: {
    reasoning?: boolean;
    cache?: boolean;
    logprobs?: boolean;
    reasoningEfforts?: ReasoningEffort[];
  };
}

// Публичное описание для UI: ни ключа, ни произвольных настроек запроса здесь нет.
export interface ModelOption {
  key: string;
  label: string;
  model: string;
  providerName: string;
  dialect: ModelDialect;
  apiKeyVariable: string | null;
  available: boolean;
  reasoningEfforts: ReasoningEffort[];
  defaultReasoningEffort: ReasoningEffort;
  capabilities: RegisteredModel['capabilities'];
  priceSource: 'provider' | 'tariffs' | 'unknown';
}

export function resolveRegistryModels(settings: HarnessSettings): RegisteredModel[] {
  const result: RegisteredModel[] = [
    {
      key: DEFAULT_MODEL_KEY,
      label: settings.model.label ?? settings.model.model,
      settings: settings.model,
      capabilities: {},
    },
  ];
  for (const [key, entry] of Object.entries(settings.models ?? {})) {
    if (key === DEFAULT_MODEL_KEY) {
      throw new Error('models.default зарезервировано для текущего блока model');
    }
    result.push(resolveRegisteredModel(settings, key, entry));
  }
  return result;
}

type RegistryModelEntry = NonNullable<HarnessSettings['models']>[string];

function resolveRegisteredModel(
  settings: HarnessSettings,
  key: string,
  entry: RegistryModelEntry,
): RegisteredModel {
  const provider = registryProvider(settings, key, entry);
  const connection = { ...provider, ...entry };
  if (connection.baseUrl === undefined || connection.apiKeyVariable === undefined) {
    throw new Error(`Модель ${key}: нужны baseUrl и apiKeyVariable (null — без ключа)`);
  }
  const dialect = connection.dialect ?? 'openai';
  const reasoningStyle = connection.reasoningStyle ?? defaultReasoningStyle(dialect);
  const model = modelSettingsSchema.parse({
    requestTimeoutMs: settings.model.requestTimeoutMs,
    maxOutputTokens: settings.model.maxOutputTokens,
    providerName: entry.provider ?? 'OpenAI-compatible',
    ...connection,
    requestExtras: { ...provider?.requestExtras, ...entry.requestExtras },
    dialect,
    reasoningStyle,
    modelKey: key,
  });
  validateDefaultEffort(key, entry, model);
  return {
    key,
    label: entry.label ?? entry.model,
    settings: model,
    capabilities: entry.capabilities ?? {},
  };
}

function defaultReasoningStyle(dialect: ModelDialect): ModelSettings['reasoningStyle'] {
  return dialect === 'openai' ? 'none' : dialect;
}

export function modelOptions(settings: HarnessSettings): ModelOption[] {
  return resolveRegistryModels(settings).map((entry) => {
    const model = entry.settings;
    const variable = model.apiKeyVariable;
    const dialect = model.dialect ?? (model.reasoningStyle === 'deepseek' ? 'deepseek' : 'openai');
    return {
      key: entry.key,
      label: entry.label,
      model: model.model,
      providerName: model.providerName,
      dialect,
      apiKeyVariable: variable,
      available: variable === null || Boolean(process.env[variable]?.trim()),
      reasoningEfforts:
        model.reasoningStyle === 'none'
          ? []
          : (entry.capabilities.reasoningEfforts ?? [...REASONING_EFFORTS]),
      defaultReasoningEffort: model.defaultReasoningEffort,
      capabilities: entry.capabilities,
      priceSource: priceSource(settings, model, dialect),
    };
  });
}

function priceSource(
  settings: HarnessSettings,
  model: ModelSettings,
  dialect: ModelDialect,
): ModelOption['priceSource'] {
  if (dialect === 'openrouter') {
    return 'provider';
  }
  return Object.hasOwn(settings.prices, model.model) ? 'tariffs' : 'unknown';
}

function registryProvider(settings: HarnessSettings, key: string, entry: RegistryModelEntry) {
  const provider = entry.provider === undefined ? undefined : settings.providers?.[entry.provider];
  if (entry.provider !== undefined && provider === undefined) {
    throw new Error(`Модель ${key}: нет провайдера ${entry.provider} в providers`);
  }
  return provider;
}

function validateDefaultEffort(key: string, entry: RegistryModelEntry, model: ModelSettings): void {
  const efforts = entry.capabilities?.reasoningEfforts;
  if (efforts !== undefined && !efforts.includes(model.defaultReasoningEffort)) {
    throw new Error(`Модель ${key}: defaultReasoningEffort должен входить в reasoningEfforts`);
  }
}

import {
  ARENA_VARIANTS,
  DEFAULT_ARENA_VARIANTS,
  type ArenaVariant,
} from '../arena/arenaVariants.js';
import { RUN_VARIANTS, type RunVariant } from '../runComparison/comparisonVariants.js';
import type { ReasoningEffort } from '../model/chatTypes.js';
import type { LoadedSettings } from '../settings/loadSettings.js';
import { DEFAULT_MODEL_KEY, resolveRegistryModels } from '../settings/modelRegistry.js';
import { selectSessionModel, validateModelEffort } from '../settings/selectSessionModel.js';
import type { EvalModel } from './evalModels.js';
import type { EvalSet } from './evalSet.js';

export type EvalVariantConfig =
  | { kind: 'questions'; name: string; description: string; variant: RunVariant }
  | { kind: 'arena'; name: string; description: string; variant: ArenaVariant };

export type EvalExecutionConfig = EvalVariantConfig & {
  loadedSettings: LoadedSettings;
  model: EvalModel;
  reasoningEffort: ReasoningEffort;
};

interface EvalModelSelection {
  loadedSettings: LoadedSettings;
  configs: EvalVariantConfig[];
  modelKeys: string[] | null;
  reasoningEffort?: ReasoningEffort;
}

export function resolveEvalVariants(set: EvalSet, names: string[] | null): EvalVariantConfig[] {
  if (set.kind === 'arena') {
    return (names ?? DEFAULT_ARENA_VARIANTS).map((name) => {
      const variant = findVariant(ARENA_VARIANTS, name);
      return { kind: 'arena', name, description: variant.description, variant };
    });
  }
  return (names ?? ['tool', 'auto']).map((name) => {
    const variant = findVariant(RUN_VARIANTS, name);
    return { kind: 'questions', name, description: variant.description, variant };
  });
}

function findVariant<Variant extends { name: string }>(variants: Variant[], name: string): Variant {
  const variant = variants.find((entry) => entry.name === name);
  if (variant === undefined) {
    throw new Error(
      `--configs: неизвестная конфигурация «${name}». Допустимые: ${variants.map((entry) => entry.name).join(', ')}`,
    );
  }
  return variant;
}

export async function prepareEvalModels(input: EvalModelSelection): Promise<EvalExecutionConfig[]> {
  const result: EvalExecutionConfig[] = [];
  for (const key of input.modelKeys ?? [DEFAULT_MODEL_KEY]) {
    const selection = await selectEvalModel(input.loadedSettings, key);
    for (const config of input.configs) {
      result.push(prepareModelConfig(input, config, selection));
    }
  }
  return result;
}

function prepareModelConfig(
  input: EvalModelSelection,
  config: EvalVariantConfig,
  selection: Awaited<ReturnType<typeof selectEvalModel>>,
): EvalExecutionConfig {
  const { model, loadedSettings } = selection;
  const variantEffort = config.kind === 'arena' ? config.variant.reasoningEffort : null;
  const reasoningEffort =
    input.reasoningEffort ?? variantEffort ?? loadedSettings.settings.model.defaultReasoningEffort;
  validateModelEffort(input.loadedSettings, model.key, reasoningEffort);
  const comparingModels = (input.modelKeys?.length ?? 1) > 1;
  const name = comparingModels ? `${config.name}@${model.key}` : config.name;
  return { ...config, name, loadedSettings, model, reasoningEffort };
}

export async function selectEvalModel(
  loaded: LoadedSettings,
  key: string,
): Promise<{ loadedSettings: LoadedSettings; model: EvalModel }> {
  const registered = resolveRegistryModels(loaded.settings).find((entry) => entry.key === key);
  if (registered === undefined) {
    throw new Error(`Неизвестная модель: ${key}`);
  }
  const loadedSettings = await selectSessionModel(loaded, key);
  const { model, baseUrl, providerName, dialect } = loadedSettings.settings.model;
  return {
    loadedSettings,
    model: { key, label: registered.label, model, baseUrl, providerName, dialect },
  };
}

export function parseEvalModelKeys(value: string): string[] {
  const keys = value.split(',').map((key) => key.trim());
  if (keys.some((key) => key.length === 0)) {
    throw new Error('--models: укажите непустые ключи реестра через запятую');
  }
  if (new Set(keys).size !== keys.length) {
    throw new Error('--models: ключи моделей не должны повторяться');
  }
  return keys;
}

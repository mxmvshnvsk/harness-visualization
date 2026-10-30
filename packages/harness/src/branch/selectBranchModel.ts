import type { HarnessEvent } from '../events/harnessEvents.js';
import type { LoadedSettings } from '../settings/loadSettings.js';
import { resolveRegistryModels } from '../settings/modelRegistry.js';
import { selectSessionModel } from '../settings/selectSessionModel.js';
import { branchSourceModel, sameBranchModel } from './branchModel.js';

export function branchSourceKey(
  loaded: LoadedSettings,
  events: readonly HarnessEvent[],
  step: number,
): string | null {
  const source = branchSourceModel(events, step);
  const matches = resolveRegistryModels(loaded.settings).filter((entry) =>
    sameBranchModel(source, entry.settings),
  );
  return (
    matches.find((entry) => entry.key === source.modelKey)?.key ??
    (matches.length === 1 ? (matches[0]?.key ?? null) : null)
  );
}

export async function selectBranchModel(
  loaded: LoadedSettings,
  events: readonly HarnessEvent[],
  step: number,
  explicitKey?: string,
): Promise<LoadedSettings> {
  const key = explicitKey ?? branchSourceKey(loaded, events, step);
  if (key === null) {
    throw new Error(
      'Исходная модель отсутствует или неоднозначна в реестре. Выберите модель явно.',
    );
  }
  return selectSessionModel(loaded, key);
}

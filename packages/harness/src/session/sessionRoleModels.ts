// Назначения разрешаются до записи сессии и любых сетевых запросов. Секреты остаются
// в LoadedSettings; события получают только identity провайдера конкретного запроса.
import type { RoleModelProviders, SessionRoleModels } from '../agent/roleModelProviders.js';
import { OpenAiCompatibleProvider } from '../model/OpenAiCompatibleProvider.js';
import type { ReasoningEffort } from '../model/chatTypes.js';
import type { RoutedFetch } from '../network/NetworkRouter.js';
import type { LoadedSettings } from '../settings/loadSettings.js';
import { selectSessionModel, validateModelEffort } from '../settings/selectSessionModel.js';
import type { SessionInput } from './startSession.js';

export interface SessionRoleModelPlan {
  orchestrator: LoadedSettings | null;
  subagents: Map<string, LoadedSettings>;
}

export async function prepareSessionRoleModels(input: SessionInput): Promise<SessionRoleModelPlan> {
  const plan: SessionRoleModelPlan = { orchestrator: null, subagents: new Map() };
  if (!input.demoProject) {
    return plan;
  }
  const { settings } = input.loadedSettings;
  if (input.orchestration !== null) {
    plan.orchestrator = await selectRoleModel({
      loaded: input.loadedSettings,
      key: settings.orchestration.modelKey,
      effort: input.reasoningEffort,
      role: 'orchestration',
    });
  }
  const names = activeSubagents(input);
  const selections = await Promise.all(
    names.map(async (name) => {
      const agent = settings.subagents.agents[name];
      if (agent === undefined) {
        throw new Error(`Для оркестрации нужен субагент «${name}» в subagents.agents`);
      }
      const selected = await selectRoleModel({
        loaded: input.loadedSettings,
        key: agent.modelKey,
        effort: agent.reasoningEffort,
        role: `subagents.agents.${name}`,
      });
      return [name, selected] as const;
    }),
  );
  plan.subagents = new Map(selections);
  return plan;
}

function activeSubagents(input: SessionInput): string[] {
  const { subagents, orchestration } = input.loadedSettings.settings;
  if (input.orchestration === 'pipeline') {
    return [orchestration.pipeline.researcher];
  }
  const enabled = input.orchestration !== null || (input.subagents ?? subagents.enabled);
  return enabled ? Object.keys(subagents.agents) : [];
}

async function selectRoleModel(selection: {
  loaded: LoadedSettings;
  key: string | null | undefined;
  effort: ReasoningEffort;
  role: string;
}): Promise<LoadedSettings> {
  const { loaded, key, effort, role } = selection;
  try {
    const inheritsSession = key === null || key === undefined;
    const selected = inheritsSession ? loaded : await selectSessionModel(loaded, key);
    validateModelEffort(loaded, key ?? loaded.settings.model.modelKey ?? 'default', effort);
    return selected;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${role}: ${message}`, { cause: error });
  }
}

export function createModelProviders(
  loaded: LoadedSettings,
  fetchImpl: RoutedFetch,
): RoleModelProviders {
  const { settings, modelApiKey } = loaded;
  const provider = new OpenAiCompatibleProvider(settings.model, modelApiKey, fetchImpl);
  const compactionModel = settings.context.compactionModel;
  const compactionProvider =
    compactionModel === null
      ? provider
      : new OpenAiCompatibleProvider(
          { ...settings.model, model: compactionModel },
          modelApiKey,
          fetchImpl,
        );
  return { provider, compactionProvider };
}

export function createSessionRoleProviders(
  plan: SessionRoleModelPlan,
  loaded: LoadedSettings,
  fetchImpl: RoutedFetch,
  session: RoleModelProviders,
): SessionRoleModels {
  const providersOf = (selected: LoadedSettings): RoleModelProviders =>
    selected === loaded ? session : createModelProviders(selected, fetchImpl);
  return {
    orchestrator: plan.orchestrator === null ? session : providersOf(plan.orchestrator),
    subagents: new Map(
      [...plan.subagents].map(([name, selected]) => [name, providersOf(selected)]),
    ),
  };
}

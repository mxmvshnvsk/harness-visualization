import {
  resolveRegistryModels,
  type LoadedSettings,
  type HarnessSettings,
  type ReasoningEffort,
} from '@harness-visualization/harness';
import type { StartSessionRequest } from './startSessionRequest.js';

export interface RoleModelOptions {
  orchestrator: string | null;
  pipelineResearcher: string;
  subagents: Record<
    string,
    {
      modelKey: string | null;
      reasoningEffort: ReasoningEffort;
      description: string;
    }
  >;
}

export function describeRoleModels(settings: HarnessSettings): RoleModelOptions {
  return {
    orchestrator: settings.orchestration.modelKey ?? null,
    pipelineResearcher: settings.orchestration.pipeline.researcher,
    subagents: Object.fromEntries(
      Object.entries(settings.subagents.agents).map(([name, agent]) => [
        name,
        {
          modelKey: agent.modelKey ?? null,
          reasoningEffort: agent.reasoningEffort,
          description: agent.description,
        },
      ]),
    ),
  };
}

// Назначения формы действуют только на этот запуск. Конфиг сервера и параллельные
// сессии сохраняют свои значения; отсутствие поля оставляет назначение из конфига.
export function withSessionRoleModels(
  loaded: LoadedSettings,
  assignments: StartSessionRequest['roleModels'],
): LoadedSettings {
  if (assignments === undefined) {
    return loaded;
  }
  const { settings } = loaded;
  const agents = { ...settings.subagents.agents };
  for (const [name, modelKey] of Object.entries(assignments.subagents ?? {})) {
    const agent = agents[name];
    if (!Object.hasOwn(agents, name) || agent === undefined) {
      throw new Error(`Неизвестный субагент: ${name}`);
    }
    agents[name] = { ...agent, modelKey };
  }
  const updated: HarnessSettings = {
    ...settings,
    subagents: { ...settings.subagents, agents },
    orchestration: { ...settings.orchestration },
  };
  if (assignments.orchestrator !== undefined) {
    updated.orchestration.modelKey = assignments.orchestrator;
  }
  resolveRegistryModels(updated);
  return { ...loaded, settings: updated };
}

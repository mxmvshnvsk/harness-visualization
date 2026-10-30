import type { ModelProvider } from '../model/modelProvider.js';
import type { AgentDependencies } from './agentDependencies.js';

export interface RoleModelProviders {
  provider: ModelProvider;
  compactionProvider: ModelProvider;
}

export interface SessionRoleModels {
  orchestrator: RoleModelProviders;
  // В карте есть и унаследованные назначения: они указывают на модель сессии,
  // поэтому смена провайдера оркестратора не меняет модель его исполнителей.
  subagents: ReadonlyMap<string, RoleModelProviders>;
}

export function orchestratorDependencies(dependencies: AgentDependencies): AgentDependencies {
  const model = dependencies.roleModels?.orchestrator;
  return model === undefined ? dependencies : { ...dependencies, ...model };
}

export function subagentDependencies(
  dependencies: AgentDependencies,
  name: string,
): AgentDependencies {
  const model = dependencies.roleModels?.subagents.get(name);
  return model === undefined ? dependencies : { ...dependencies, ...model };
}

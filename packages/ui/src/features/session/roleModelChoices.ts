import type { ModelOption, ReasoningEffort } from '@harness-visualization/harness';
import type { ChoicesState } from './sessionChoices';

export interface RoleModelChoice {
  name: string;
  label: string;
  description: string;
  modelKey: string | null;
  model: ModelOption | undefined;
  effort: ReasoningEffort;
  orchestrator: boolean;
}

export function activeRoleModels(state: ChoicesState): RoleModelChoice[] {
  const { choices, options } = state;
  if (!choices.demoProject || options === null) {
    return [];
  }
  const roles: RoleModelChoice[] = [];
  if (choices.orchestration) {
    roles.push(orchestratorRole(state));
  }
  if (choices.subagents || choices.orchestration) {
    roles.push(...activeSubagentNames(state).map((name) => subagentRole(name, state)));
  }
  return roles;
}

function selectionKey(
  selected: string | null | undefined,
  configured: string | null | undefined,
): string | null {
  return selected === undefined ? (configured ?? null) : selected;
}

function orchestratorRole(state: ChoicesState): RoleModelChoice {
  const { choices, options } = state;
  const modelKey = selectionKey(
    choices.roleModels?.orchestrator,
    options?.roleModels?.orchestrator,
  );
  return {
    name: 'orchestrator',
    label: 'Оркестратор',
    description:
      choices.orchestrationMode === 'pipeline'
        ? 'Итоговый ответ по конспектам'
        : 'План, поручения и итоговый ответ',
    modelKey,
    model: findModel(modelKey, state),
    effort: choices.reasoningEffort,
    orchestrator: true,
  };
}

function subagentRole(name: string, state: ChoicesState): RoleModelChoice {
  const configured = state.options?.roleModels?.subagents[name] ?? {
    modelKey: null,
    reasoningEffort: 'low' as const,
    description: 'Выполняет поручение в отдельном контексте',
  };
  const modelKey = selectionKey(state.choices.roleModels?.subagents?.[name], configured.modelKey);
  return {
    name,
    label: name === 'researcher' ? 'Исследователь' : name,
    description:
      name === 'researcher' ? 'Читает документы и возвращает факты' : configured.description,
    modelKey,
    model: findModel(modelKey, state),
    effort: configured.reasoningEffort,
    orchestrator: false,
  };
}

function activeSubagentNames({
  choices,
  options,
}: Pick<ChoicesState, 'choices' | 'options'>): string[] {
  const names = options?.subagents.agents ?? [];
  if (choices.orchestration && choices.orchestrationMode === 'pipeline') {
    const researcher = options?.roleModels?.pipelineResearcher ?? 'researcher';
    return names.filter((name) => name === researcher);
  }
  return names;
}

function findModel(key: string | null, state: Pick<ChoicesState, 'choices' | 'options'>) {
  return state.options?.models.find((model) => model.key === (key ?? state.choices.modelKey));
}

export function roleModelError(role: RoleModelChoice): string | null {
  const { model } = role;
  if (model === undefined) {
    return `${role.label}: выбранная модель удалена из реестра. Выберите другую или «Как у сессии».`;
  }
  if (!model.available) {
    return `${role.label}: нет ключа ${model.apiKeyVariable}. Выберите другую модель или задайте ключ на сервере.`;
  }
  if (model.reasoningEfforts.length > 0 && !model.reasoningEfforts.includes(role.effort)) {
    return `${role.label}: ${model.label} не поддерживает effort ${role.effort}. Выберите другую модель${role.orchestrator ? ' или измените effort сессии' : ''}.`;
  }
  return null;
}

export function roleModelErrors(state: ChoicesState): string[] {
  return activeRoleModels(state)
    .map(roleModelError)
    .filter((error) => error !== null);
}

export function modelOptionLabel(model: ModelOption): string {
  const label = `${model.label} · ${model.providerName}`;
  return model.available ? label : `${label} · нет ${model.apiKeyVariable}`;
}

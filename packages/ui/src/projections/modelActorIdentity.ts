import type { BranchModel } from '@harness-visualization/harness/branch';
import type { EventOfType } from '../events/eventTypes';
import type { ModelActor } from './modelActorTypes';

export function requestModelActor(request: EventOfType<'model_request'>): ModelActor {
  const requestedModel =
    typeof request.body.model === 'string' ? request.body.model : 'модель не указана';
  const identity = request.modelIdentity;
  const model = identity?.model ?? requestedModel;
  const baseUrl = identity?.baseUrl ?? request.url.replace(/\/chat\/completions\/?$/, '');
  return {
    key: modelActorKey(baseUrl, model),
    baseUrl,
    label: model,
    requested: model,
    returned: null,
    provider: identity?.providerName ?? hostOf(request.url),
  };
}

export function inheritedModelActor(model: BranchModel): ModelActor {
  return {
    key: modelActorKey(model.baseUrl, model.model),
    baseUrl: model.baseUrl,
    label: model.model,
    requested: model.model,
    returned: null,
    provider: model.providerName,
  };
}

export function modelActorKey(baseUrl: string, model: string): string {
  return `${baseUrl}:${model}`;
}

export function toolActorKey(agentId: string | null | undefined, toolCallId: string): string {
  return `${agentId ?? ''}:${toolCallId}`;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'провайдер не указан';
  }
}

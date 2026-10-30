import type { HarnessEvent } from '../events/harnessEvents.js';

type EventOf<Type extends HarnessEvent['type']> = Extract<HarnessEvent, { type: Type }>;

// Сводка записи без текущей конфигурации: провайдер помогает различить одинаковые имена.
export function traceModelNames(events: readonly HarnessEvent[]): string[] {
  const names = inheritedModelNames(events);
  const responses = new Map<string, EventOf<'model_response'>>();
  for (const event of events) {
    if (event.type === 'model_response') {
      responses.set(event.requestId, event);
    }
  }
  for (const event of events) {
    if (event.type === 'model_request') {
      const response = responses.get(event.requestId);
      const { key, label } = requestModelName(event, response);
      names.set(key, label);
    }
  }
  return [...names.values()];
}

function inheritedModelNames(events: readonly HarnessEvent[]): Map<string, string> {
  const names = new Map<string, string>();
  const branch = events.find((event) => event.type === 'branch_started');
  for (const { model } of branch?.historyActors ?? []) {
    const key = `${model.baseUrl.replace(/\/$/, '')}:${model.model}`;
    names.set(key, `${model.model} · ${model.providerName}`);
  }
  return names;
}

function requestModelName(
  request: EventOf<'model_request'>,
  response: EventOf<'model_response'> | undefined,
): { key: string; label: string } {
  const requestedModel =
    typeof request.body.model === 'string' ? request.body.model : 'модель не указана';
  const actualModel = response?.reply.model ?? requestedModel;
  const baseUrl =
    request.modelIdentity?.baseUrl ?? request.url.replace(/\/chat\/completions\/?$/, '');
  const providerName = request.modelIdentity?.providerName ?? hostOf(request.url);
  return {
    key: `${baseUrl.replace(/\/$/, '')}:${actualModel}`,
    label: `${actualModel} · ${providerName}`,
  };
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'провайдер не указан';
  }
}

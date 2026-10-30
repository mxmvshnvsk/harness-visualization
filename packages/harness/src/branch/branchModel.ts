import type { HarnessEvent, ModelRequestPayload } from '../events/harnessEvents.js';
import { listBranchSteps } from './branchPoint.js';

export interface BranchModel {
  model: string;
  baseUrl: string;
  providerName: string;
  modelKey?: string;
}

export function branchSourceModel(events: readonly HarnessEvent[], step: number): BranchModel {
  const requestId = listBranchSteps(events).find(
    (branchStep) => branchStep.step === step,
  )?.requestId;
  const request = events.find(
    (event) => event.type === 'model_request' && event.requestId === requestId,
  );
  if (request?.type !== 'model_request' || typeof request.body.model !== 'string') {
    throw new Error('В шаге не указана модель — выберите другую точку ветвления');
  }
  return request.modelIdentity ?? legacyRequestModel(request, events);
}

// Старые записи не содержат identity: источник определяем по самому запросу и началу сессии.
function legacyRequestModel(
  request: ModelRequestPayload,
  events: readonly HarnessEvent[],
): BranchModel {
  const started = events.find((event) => event.type === 'session_started');
  const model = typeof request.body.model === 'string' ? request.body.model : 'модель не указана';
  const matchesSession = started?.type === 'session_started' && started.model === model;
  const source: BranchModel = {
    model,
    baseUrl: request.url.replace(/\/chat\/completions\/?$/, ''),
    providerName: matchesSession ? started.providerName : new URL(request.url).host,
  };
  if (matchesSession && started.modelKey !== undefined) {
    source.modelKey = started.modelKey;
  }
  return source;
}

export function sameBranchModel(left: BranchModel, right: BranchModel): boolean {
  const leftBaseUrl = left.baseUrl.replace(/\/$/, '');
  const rightBaseUrl = right.baseUrl.replace(/\/$/, '');
  return left.model === right.model && leftBaseUrl === rightBaseUrl;
}

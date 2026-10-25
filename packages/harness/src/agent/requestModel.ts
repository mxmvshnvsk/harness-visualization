// Один запрос к модели в три видимых шага:
// собрать HTTP-запрос → отправить → разобрать ответ.
// На каждом шаге отправляется событие, поэтому запрос можно увидеть целиком.

import { randomUUID } from 'node:crypto';
import type { ModelReply, ModelRequest } from '../model/chatTypes.js';
import type { RawHttpResponse } from '../model/modelProvider.js';
import { maskSecretHeaders } from '../model/maskSecretHeaders.js';
import { ModelProviderError } from '../model/ModelProviderError.js';
import type { ModelRequestPurpose } from '../events/harnessEvents.js';
import { calculateCost } from '../tokenomics/calculateCost.js';
import type { AgentDependencies } from './agentDependencies.js';

// Запросу к модели нужны только провайдер, поток событий и цены — так его может вызывать
// не только цикл агента, но и, например, судья в check-grounding (этап 5b.3).
export type ModelRequestDependencies = Pick<AgentDependencies, 'provider' | 'events' | 'prices'>;

// Шаг цикла агента или служебный запрос харнесса — это видно в событии model_request.
export type ModelRequestStep =
  | { purpose: 'agentStep'; iteration: number }
  | { purpose: Exclude<ModelRequestPurpose, 'agentStep'>; iteration: null };

export interface ModelExchange {
  requestId: string;
  reply: ModelReply;
}

export async function requestModel(
  request: ModelRequest,
  dependencies: ModelRequestDependencies,
  step: ModelRequestStep,
): Promise<ModelExchange> {
  const { provider, events } = dependencies;
  const requestId = randomUUID();
  const preparedRequest = provider.prepareRequest(request);
  events.emit({
    type: 'model_request',
    requestId,
    purpose: step.purpose,
    iteration: step.iteration,
    reasoningEffort: request.reasoningEffort,
    method: preparedRequest.method,
    url: preparedRequest.url,
    headers: maskSecretHeaders(preparedRequest.headers),
    body: preparedRequest.body,
  });

  const requestedAt = new Date();
  const rawResponse = await sendAndReportFailure(requestId, dependencies, () =>
    provider.send(preparedRequest),
  );
  const reply = parseAndReportFailure(requestId, rawResponse, dependencies);

  events.emit({
    type: 'model_response',
    requestId,
    status: rawResponse.status,
    durationMs: rawResponse.durationMs,
    body: rawResponse.body,
    reply,
    cost: calculateCost(reply.usage, dependencies.prices[provider.model], requestedAt),
  });
  return { requestId, reply };
}

async function sendAndReportFailure(
  requestId: string,
  dependencies: ModelRequestDependencies,
  send: () => Promise<RawHttpResponse>,
): Promise<RawHttpResponse> {
  try {
    return await send();
  } catch (error) {
    reportModelError(requestId, error, null, dependencies);
    throw error;
  }
}

function parseAndReportFailure(
  requestId: string,
  rawResponse: RawHttpResponse,
  dependencies: ModelRequestDependencies,
): ModelReply {
  try {
    return dependencies.provider.parseReply(rawResponse);
  } catch (error) {
    reportModelError(requestId, error, rawResponse, dependencies);
    throw error;
  }
}

function reportModelError(
  requestId: string,
  error: unknown,
  rawResponse: RawHttpResponse | null,
  dependencies: ModelRequestDependencies,
): void {
  const isProviderError = error instanceof ModelProviderError;
  dependencies.events.emit({
    type: 'model_error',
    requestId,
    status: rawResponse?.status ?? (isProviderError ? error.status : null),
    durationMs: rawResponse?.durationMs ?? null,
    body: rawResponse?.body ?? (isProviderError ? error.responseBody : null),
    message: error instanceof Error ? error.message : String(error),
  });
}

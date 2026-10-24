// Один запрос к модели в три видимых шага:
// собрать HTTP-запрос → отправить → разобрать ответ.
// На каждом шаге отправляется событие, поэтому запрос можно увидеть целиком.

import { randomUUID } from 'node:crypto';
import type { ModelReply, ModelRequest } from '../model/chatTypes.js';
import type { RawHttpResponse } from '../model/modelProvider.js';
import { maskSecretHeaders } from '../model/maskSecretHeaders.js';
import { ModelProviderError } from '../model/ModelProviderError.js';
import { calculateCost } from '../tokenomics/calculateCost.js';
import type { AgentDependencies } from './agentDependencies.js';

export async function requestModel(
  request: ModelRequest,
  dependencies: AgentDependencies,
): Promise<ModelReply> {
  const { provider, events } = dependencies;
  const requestId = randomUUID();
  const preparedRequest = provider.prepareRequest(request);
  events.emit({
    type: 'model_request',
    requestId,
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
  return reply;
}

async function sendAndReportFailure(
  requestId: string,
  dependencies: AgentDependencies,
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
  dependencies: AgentDependencies,
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
  dependencies: AgentDependencies,
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

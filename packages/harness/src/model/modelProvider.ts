// Интерфейс провайдера модели.
// Запрос разбит на три шага, чтобы харнесс мог показать каждый из них:
// какой HTTP-запрос собран, что вернул сервер и как ответ понят.

import type { ModelReply, ModelRequest } from './chatTypes.js';

export interface PreparedHttpRequest {
  method: 'POST';
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

export interface RawHttpResponse {
  status: number;
  durationMs: number;
  // Тело ответа как есть: разобранный JSON или текст, если это не JSON.
  body: unknown;
}

export interface ModelProvider {
  readonly model: string;
  prepareRequest(request: ModelRequest): PreparedHttpRequest;
  send(preparedRequest: PreparedHttpRequest): Promise<RawHttpResponse>;
  parseReply(rawResponse: RawHttpResponse): ModelReply;
}

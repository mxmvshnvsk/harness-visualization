// Интерфейс провайдера модели.
// Запрос разбит на три шага, чтобы харнесс мог показать каждый из них:
// какой HTTP-запрос собран, что вернул сервер и как ответ понят.

import type { ModelReply, ModelRequest, ResponseTiming } from './chatTypes.js';
import type { StreamDelta } from './readCompletionStream.js';

export interface PreparedHttpRequest {
  method: 'POST';
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

export interface RawHttpResponse {
  status: number;
  durationMs: number;
  // Тело ответа: разобранный JSON или текст, если это не JSON. При потоковом ответе —
  // собранный из кусков объект в том же формате, что и без потока.
  body: unknown;
  // Моменты потокового ответа; null — ответ пришёл целиком (поток выключен или ошибка).
  timing: ResponseTiming | null;
}

// Кусочки ответа по мере генерации — для печатания вживую; в трейс не пишутся.
export type DeltaListener = (delta: StreamDelta) => void;

export interface ModelProvider {
  readonly model: string;
  prepareRequest(request: ModelRequest): PreparedHttpRequest;
  send(preparedRequest: PreparedHttpRequest, onDelta?: DeltaListener): Promise<RawHttpResponse>;
  parseReply(rawResponse: RawHttpResponse): ModelReply;
}

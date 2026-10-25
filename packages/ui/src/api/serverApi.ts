// Запросы к серверу харнесса (packages/server). Типы ответов — из самого сервера:
// так интерфейс не разойдётся с API незаметно — расхождение поймает tsc.

import type {
  SessionDetails,
  SessionSummary,
  StartSessionRequest,
  StartSessionResponse,
  TraceSummary,
} from '@harness-visualization/server';

export async function listSessions(): Promise<SessionSummary[]> {
  return getJson<SessionSummary[]>('/api/sessions');
}

export async function listTraces(): Promise<TraceSummary[]> {
  return getJson<TraceSummary[]>('/api/traces');
}

export async function getSession(sessionId: string): Promise<SessionDetails> {
  return getJson<SessionDetails>(`/api/sessions/${encodeURIComponent(sessionId)}`);
}

export async function startSession(request: StartSessionRequest): Promise<StartSessionResponse> {
  return postJson<StartSessionResponse>('/api/sessions', request);
}

export async function answerPermission(
  sessionId: string,
  toolCallId: string,
  approved: boolean,
): Promise<void> {
  await postJson(`/api/sessions/${encodeURIComponent(sessionId)}/permissions`, {
    toolCallId,
    approved,
  });
}

export function sessionEventsUrl(sessionId: string): string {
  return `/api/sessions/${encodeURIComponent(sessionId)}/events`;
}

export function traceEventsUrl(file: string): string {
  return `/api/traces/${encodeURIComponent(file)}/events`;
}

// Ошибка ответа сервера: статус и текст из его тела ({ error }).
export class ServerError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function getJson<Result>(url: string): Promise<Result> {
  return readResponse<Result>(await fetch(url));
}

async function postJson<Result>(url: string, body: unknown): Promise<Result> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return readResponse<Result>(response);
}

async function readResponse<Result>(response: Response): Promise<Result> {
  const body: unknown = await response.json();
  if (!response.ok) {
    throw new ServerError(response.status, describeErrorBody(body, response.status));
  }
  return body as Result;
}

function describeErrorBody(body: unknown, status: number): string {
  if (typeof body === 'object' && body !== null && 'error' in body) {
    return String(body.error);
  }
  return `HTTP ${String(status)}`;
}

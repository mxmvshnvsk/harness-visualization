// Запросы к серверу харнесса (packages/server). Типы ответов — из самого сервера:
// так интерфейс не разойдётся с API незаметно — расхождение поймает tsc.

import type { EvalReport } from '@harness-visualization/harness/evals';
import type { LabBase, LabIndex, LabSearch } from '@harness-visualization/mcp-server/lab';
import type {
  SessionDetails,
  SessionSummary,
  StartSessionRequest,
  StartSessionResponse,
  TraceSummary,
  TraceOutcome,
  GroundingReportResponse,
  McpCourseResponse,
  EvalsResponse,
  BranchRequest,
  ImportTraceResponse,
  ArenaRunRequest,
  FreeProjectsResponse,
  FreeRunRequest,
  ArenaTasksResponse,
  SessionOptionsResponse,
  TokenLabForkRequest,
  TokenLabResponse,
  TokenLabRunRequest,
  TokenLabRunResponse,
} from '@harness-visualization/server';

export async function listSessions(): Promise<SessionSummary[]> {
  return getJson<SessionSummary[]>('/api/sessions');
}

export async function listTraces(): Promise<TraceSummary[]> {
  return getJson<TraceSummary[]>('/api/traces');
}

// Чем кончилась записанная сессия — для сравнения веток (этап 9).
export async function getTraceOutcome(file: string): Promise<TraceOutcome> {
  return getJson<TraceOutcome>(`/api/traces/${encodeURIComponent(file)}/outcome`);
}

export async function getSession(sessionId: string): Promise<SessionDetails> {
  return getJson<SessionDetails>(`/api/sessions/${encodeURIComponent(sessionId)}`);
}

// Значения формы новой сессии по умолчанию — из harness.config.json.
export async function getSessionOptions(): Promise<SessionOptionsResponse> {
  return getJson<SessionOptionsResponse>('/api/session-options');
}

export async function startSession(request: StartSessionRequest): Promise<StartSessionResponse> {
  return postJson<StartSessionResponse>('/api/sessions', request);
}

// Код-арена (этап 10): задачи и запуск прогона — ответ как у новой сессии.
export async function getArenaTasks(): Promise<ArenaTasksResponse> {
  return getJson<ArenaTasksResponse>('/api/arena/tasks');
}

// Свободный режим арены (этап 10.4): проекты и запуск — новый, продолжение, копия папки.
export async function getFreeProjects(): Promise<FreeProjectsResponse> {
  return getJson<FreeProjectsResponse>('/api/arena/projects');
}

export async function startFreeRun(request: FreeRunRequest): Promise<StartSessionResponse> {
  return postJson<StartSessionResponse>('/api/arena/free', request);
}

export async function startArenaRun(request: ArenaRunRequest): Promise<StartSessionResponse> {
  return postJson<StartSessionResponse>('/api/arena/runs', request);
}

// Запись чужого харнесса (этап 9.4): сервер переводит её в наш трейс и сохраняет в traces/.
export async function importTrace(text: string): Promise<ImportTraceResponse> {
  return postJson<ImportTraceResponse>('/api/traces/import', { format: 'auto', text });
}

// Ветка от шага записанного трейса (этап 9): ответ — как у новой сессии.
export async function startBranch(request: BranchRequest): Promise<StartSessionResponse> {
  return postJson<StartSessionResponse>('/api/sessions/branch', request);
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

// Следующий вопрос диалога (после awaiting_question) и конец диалога.
export async function askNextQuestion(sessionId: string, text: string): Promise<void> {
  await postJson(`/api/sessions/${encodeURIComponent(sessionId)}/messages`, { text });
}

export async function finishSession(sessionId: string): Promise<void> {
  await postJson(`/api/sessions/${encodeURIComponent(sessionId)}/finish`, {});
}

export function sessionEventsUrl(sessionId: string): string {
  return `/api/sessions/${encodeURIComponent(sessionId)}/events`;
}

export function traceEventsUrl(file: string): string {
  return `/api/traces/${encodeURIComponent(file)}/events`;
}

// Ошибка ответа сервера: статус и текст из его тела ({ error }).
// Лаборатория RAG (этап 8b). Модели эмбеддингов нет — ServerError с кодом 503.
export async function getRagBase(): Promise<LabBase> {
  return getJson('/api/rag/base');
}

// События записанной сессии курса MCP (examples/traces).
export async function getEvals(): Promise<EvalsResponse> {
  return getJson('/api/evals');
}

export async function getEvalReport(file: string): Promise<EvalReport> {
  return getJson(`/api/evals/reports/${encodeURIComponent(file)}`);
}

export async function getTokenLab(): Promise<TokenLabResponse> {
  return getJson('/api/token-lab');
}

export async function getTokenLabRun(file: string): Promise<TokenLabRunResponse> {
  return getJson(`/api/token-lab/runs/${encodeURIComponent(file)}`);
}

export async function startTokenFork(request: TokenLabForkRequest): Promise<TokenLabRunResponse> {
  return postJson<TokenLabRunResponse>('/api/token-lab/forks', request);
}

export async function startTokenLabRun(request: TokenLabRunRequest): Promise<TokenLabRunResponse> {
  return postJson<TokenLabRunResponse>('/api/token-lab/runs', request);
}

export async function getMcpCourse(): Promise<McpCourseResponse> {
  return getJson('/api/mcp/course');
}

export async function getRagIndex(): Promise<LabIndex> {
  return getJson('/api/rag/index');
}

export async function searchRag(query: string): Promise<LabSearch> {
  return postJson('/api/rag/search', { query });
}

export async function embedTexts(texts: readonly string[]): Promise<number[][]> {
  return (await postJson<{ vectors: number[][] }>('/api/rag/embed', { texts })).vectors;
}

export async function getGrounding(file: string): Promise<GroundingReportResponse> {
  return getJson(`/api/rag/grounding/${encodeURIComponent(file)}`);
}

// Проверка опоры учебного ответа курса — трейс лежит в репозитории (examples/traces).
export async function getCourseGrounding(): Promise<GroundingReportResponse> {
  return getJson('/api/rag/course/grounding');
}

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

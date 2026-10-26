// Типы API сервера — для интерфейса (packages/ui). Только типы: код сервера в браузер не попадает.

import type { PendingPermissionSummary } from './permissions/PendingPermissions.js';
import type { PendingQuestionSummary } from './sessions/PendingQuestions.js';
import type { SessionSummary } from './sessions/SessionRegistry.js';

export type { AnswerPermissionRequest } from './permissions/answerPermissionRequest.js';
export type { PendingPermissionSummary } from './permissions/PendingPermissions.js';
export type { PendingQuestionSummary } from './sessions/PendingQuestions.js';
export type { SessionStatus, SessionSummary } from './sessions/SessionRegistry.js';
export type { StartSessionRequest } from './sessions/startSessionRequest.js';
export type { SessionOptionsResponse } from './sessions/sessionRoutes.js';
export type { TraceBranch, TraceKind, TraceSummary } from './traces/TraceCatalog.js';
export type { TraceOutcome, TraceStreamEnd } from './traces/traceRoutes.js';
export type { GroundingClaim, GroundingReportResponse } from './rag/groundingReport.js';
export type { McpCourseResponse } from './labs/mcpCourseRoutes.js';
export type {
  TokenLabForkRequest,
  TokenLabResponse,
  TokenLabRunRequest,
  TokenLabRunResponse,
} from './labs/tokenLabRoutes.js';
export type { EvalReportSummary, EvalsResponse } from './evals/evalRoutes.js';
export type { BranchRequest } from './sessions/branchRoutes.js';
export type { ImportTraceResponse } from './traces/importRoutes.js';
export type {
  ArenaRunRequest,
  ArenaTaskSummary,
  ArenaTasksResponse,
  FreeProjectsResponse,
  FreeRunRequest,
} from './arena/arenaRoutes.js';

// GET /api/sessions/:sessionId
export interface SessionDetails extends SessionSummary {
  pendingPermissions: PendingPermissionSummary[];
  // Диалог ждёт следующего вопроса; null — ход идёт или сессия закончилась.
  pendingQuestion: PendingQuestionSummary | null;
}

// POST /api/sessions
export interface StartSessionResponse {
  sessionId: string;
  eventsUrl: string;
}

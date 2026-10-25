// Маршруты сессий:
//   POST /api/sessions                    — запустить сессию, сразу ответить её id;
//   GET  /api/sessions                    — список сессий этого запуска сервера;
//   GET  /api/session-options             — что форма новой сессии берёт по умолчанию;
//   GET  /api/sessions/:sessionId         — состояние одной сессии и вопросы, ждущие ответа;
//   GET  /api/sessions/:sessionId/events  — поток её событий (SSE), с пропущенными по Last-Event-ID;
//   POST /api/sessions/:sessionId/permissions — ответ на permission_requested;
//   POST /api/sessions/:sessionId/messages    — следующий вопрос диалога (после awaiting_question);
//   POST /api/sessions/:sessionId/finish      — закончить диалог.

import {
  describeSubagentsOption,
  startSession,
  type LoadedSettings,
  type SessionInput,
  type SubagentsOption,
} from '@harness-visualization/harness';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { answerPermissionRequestSchema } from '../permissions/answerPermissionRequest.js';
import type { PendingPermissions } from '../permissions/PendingPermissions.js';
import { nextQuestionRequestSchema } from './nextQuestionRequest.js';
import type { PendingQuestions } from './PendingQuestions.js';
import { openEventStream } from '../sse/openEventStream.js';
import { formatEnd, formatEvent, formatHeartbeat, parseLastEventId } from '../sse/sseMessages.js';
import type { SessionRegistry } from './SessionRegistry.js';
import { startSessionRequestSchema, type StartSessionRequest } from './startSessionRequest.js';

const HEARTBEAT_INTERVAL_MS = 15000;

export interface SessionRoutesOptions {
  loadedSettings: LoadedSettings;
  projectRoot: string;
  registry: SessionRegistry;
  permissions: PendingPermissions;
  questions: PendingQuestions;
}

// GET /api/session-options: значения из harness.config.json — с них форма начинает.
export interface SessionOptionsResponse {
  reasoningEffort: StartSessionRequest['reasoningEffort'];
  retrievalMode: StartSessionRequest['retrievalMode'];
  subagents: SubagentsOption;
}

interface SessionParams {
  sessionId: string;
}

interface EventsQuery {
  after?: string;
}

export function registerSessionRoutes(app: FastifyInstance, options: SessionRoutesOptions): void {
  const { registry, permissions } = options;

  app.post('/api/sessions', async (request, reply) => {
    const parsed = startSessionRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.message });
    }
    const sessionId = await launchSession(parsed.data, options);
    return reply.code(201).send({ sessionId, eventsUrl: `/api/sessions/${sessionId}/events` });
  });

  app.get('/api/sessions', () => registry.list());

  app.get('/api/session-options', (): SessionOptionsResponse => {
    const { settings } = options.loadedSettings;
    return {
      reasoningEffort: settings.model.defaultReasoningEffort,
      retrievalMode: settings.retrieval.mode,
      subagents: describeSubagentsOption(settings),
    };
  });

  app.get<{ Params: SessionParams }>('/api/sessions/:sessionId', (request, reply) => {
    const summary = registry.summary(request.params.sessionId);
    if (summary === null) {
      return reply.code(404).send({ error: 'Сессии нет в памяти сервера' });
    }
    return {
      ...summary,
      pendingPermissions: permissions.forSession(summary.sessionId),
      pendingQuestion: options.questions.forSession(summary.sessionId),
    };
  });

  registerDialogRoutes(app, options);

  app.post<{ Params: SessionParams }>('/api/sessions/:sessionId/permissions', (request, reply) => {
    const { sessionId } = request.params;
    if (registry.summary(sessionId) === null) {
      return reply.code(404).send({ error: 'Сессии нет в памяти сервера' });
    }
    const parsed = answerPermissionRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.message });
    }
    const { toolCallId, approved } = parsed.data;
    if (permissions.answer(sessionId, toolCallId, approved) === 'notPending') {
      // 409: вопрос уже закрыт — ответили раньше, истёк срок или toolCallId не тот.
      return reply.code(409).send({ error: 'Этот вопрос не ждёт ответа' });
    }
    return { toolCallId, approved };
  });

  app.get<{ Params: SessionParams; Querystring: EventsQuery }>(
    '/api/sessions/:sessionId/events',
    (request, reply) => {
      streamSessionEvents(request, reply, registry);
    },
  );
}

// Диалог: следующий вопрос или конец. 409 — сессия сейчас не ждёт вопроса: ход ещё идёт,
// сессия уже закончилась или вопрос прислали дважды.
function registerDialogRoutes(
  app: FastifyInstance,
  { registry, questions }: SessionRoutesOptions,
): void {
  app.post<{ Params: SessionParams }>('/api/sessions/:sessionId/messages', (request, reply) => {
    const { sessionId } = request.params;
    if (registry.summary(sessionId) === null) {
      return reply.code(404).send({ error: 'Сессии нет в памяти сервера' });
    }
    const parsed = nextQuestionRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.message });
    }
    if (questions.answer(sessionId, parsed.data.text) === 'notPending') {
      return reply.code(409).send({ error: 'Сессия сейчас не ждёт вопроса' });
    }
    return { text: parsed.data.text };
  });

  app.post<{ Params: SessionParams }>('/api/sessions/:sessionId/finish', (request, reply) => {
    const { sessionId } = request.params;
    if (registry.summary(sessionId) === null) {
      return reply.code(404).send({ error: 'Сессии нет в памяти сервера' });
    }
    if (questions.answer(sessionId, null) === 'notPending') {
      return reply.code(409).send({ error: 'Сессия сейчас не ждёт вопроса' });
    }
    return { finished: true };
  });
}

async function launchSession(
  body: StartSessionRequest,
  options: SessionRoutesOptions,
): Promise<string> {
  const { loadedSettings, projectRoot, registry, permissions, questions } = options;
  // id сессии узнаём из первого события: permission_requested приходит раньше вопроса,
  // так что к вызову confirmAction он уже известен.
  let sessionId = '';
  const session = await startSession(toSessionInput(body, loadedSettings, projectRoot), {
    confirmAction: (request) => permissions.ask(sessionId, request),
    nextQuestion: (turn) => questions.ask(sessionId, turn),
    listeners: [
      (event) => {
        sessionId = event.sessionId;
        registry.ensure(event.sessionId, body.question);
        registry.record(event);
      },
    ],
    log: (message) => {
      console.log(`  ${message}`);
    },
  });
  registry.ensure(session.sessionId, body.question);
  console.log(`Сессия ${session.sessionId}: «${body.question}»`);
  session.completion
    .then((result) => {
      registry.finish(session.sessionId, result);
      console.log(`Сессия ${session.sessionId} закончилась: ${result.tracePath}`);
    })
    .catch((error: unknown) => {
      registry.finish(session.sessionId, { failed: true, tracePath: '' });
      console.error(`Сессия ${session.sessionId}: ${String(error)}`);
    });
  return session.sessionId;
}

function toSessionInput(
  body: StartSessionRequest,
  loadedSettings: LoadedSettings,
  projectRoot: string,
): SessionInput {
  const { settings } = loadedSettings;
  return {
    loadedSettings,
    projectRoot,
    question: body.question,
    reasoningEffort: body.reasoningEffort ?? settings.model.defaultReasoningEffort,
    searchProvider: body.searchProvider ?? null,
    retrievalMode: body.retrievalMode ?? settings.retrieval.mode,
    retrievalToolName: body.retrievalToolName ?? null,
    freshWorkspace: body.freshWorkspace ?? false,
    subagents: body.subagents ?? null,
    workspaceDirectory: null,
  };
}

// Сначала — пропущенное из буфера, потом — вживую, пока сессия не закончится
// или браузер не закроет поток.
function streamSessionEvents(
  request: FastifyRequest<{ Params: SessionParams; Querystring: EventsQuery }>,
  reply: FastifyReply,
  registry: SessionRegistry,
): void {
  const { sessionId } = request.params;
  const summary = registry.summary(sessionId);
  if (summary === null) {
    void reply.code(404).send({ error: 'Сессии нет в памяти сервера' });
    return;
  }
  const lastEventId = parseLastEventId(request.headers['last-event-id'] ?? request.query.after);
  const socket = openEventStream(reply);
  for (const event of registry.eventsAfter(sessionId, lastEventId)) {
    socket.write(formatEvent(event));
  }
  if (summary.status !== 'running') {
    socket.end(formatEnd(summary));
    return;
  }
  const unsubscribe = registry.subscribe(sessionId, {
    onEvent: (event) => socket.write(formatEvent(event)),
    onEnd: (finished) => socket.end(formatEnd(finished)),
  });
  const heartbeat = setInterval(() => socket.write(formatHeartbeat()), HEARTBEAT_INTERVAL_MS);
  request.raw.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
}

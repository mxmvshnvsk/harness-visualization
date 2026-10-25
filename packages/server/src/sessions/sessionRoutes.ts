// Маршруты сессий:
//   POST /api/sessions                    — запустить сессию, сразу ответить её id;
//   GET  /api/sessions                    — список сессий этого запуска сервера;
//   GET  /api/sessions/:sessionId         — состояние одной сессии;
//   GET  /api/sessions/:sessionId/events  — поток её событий (SSE), с пропущенными по Last-Event-ID.

import {
  startSession,
  type LoadedSettings,
  type SessionInput,
} from '@harness-visualization/harness';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  formatEnd,
  formatEvent,
  formatHeartbeat,
  formatRetry,
  parseLastEventId,
} from '../sse/sseMessages.js';
import type { SessionRegistry } from './SessionRegistry.js';
import { startSessionRequestSchema, type StartSessionRequest } from './startSessionRequest.js';

const HEARTBEAT_INTERVAL_MS = 15000;

export interface SessionRoutesOptions {
  loadedSettings: LoadedSettings;
  projectRoot: string;
  registry: SessionRegistry;
}

interface SessionParams {
  sessionId: string;
}

interface EventsQuery {
  after?: string;
}

export function registerSessionRoutes(app: FastifyInstance, options: SessionRoutesOptions): void {
  const { registry } = options;

  app.post('/api/sessions', async (request, reply) => {
    const parsed = startSessionRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.message });
    }
    const sessionId = await launchSession(parsed.data, options);
    return reply.code(201).send({ sessionId, eventsUrl: `/api/sessions/${sessionId}/events` });
  });

  app.get('/api/sessions', () => registry.list());

  app.get<{ Params: SessionParams }>('/api/sessions/:sessionId', (request, reply) => {
    const summary = registry.summary(request.params.sessionId);
    if (summary === null) {
      return reply.code(404).send({ error: 'Сессии нет в памяти сервера' });
    }
    return summary;
  });

  app.get<{ Params: SessionParams; Querystring: EventsQuery }>(
    '/api/sessions/:sessionId/events',
    (request, reply) => {
      streamSessionEvents(request, reply, registry);
    },
  );
}

async function launchSession(
  body: StartSessionRequest,
  options: SessionRoutesOptions,
): Promise<string> {
  const { loadedSettings, projectRoot, registry } = options;
  const session = await startSession(toSessionInput(body, loadedSettings, projectRoot), {
    // Разрешения из браузера — шаг 7.3. Пока спросить некого, а молчание — не согласие.
    confirmAction: () => Promise.resolve(false),
    listeners: [
      (event) => {
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
    workspaceDirectory: null,
  };
}

// Ответ пишется руками в сокет (reply.hijack): Fastify не знает про SSE, а нам и не нужно —
// формат простой и виден целиком (sseMessages.ts). Сначала — пропущенное из буфера,
// потом — вживую, пока сессия не закончится или браузер не закроет поток.
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
  reply.hijack();
  const socket = reply.raw;
  socket.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });
  socket.write(formatRetry());
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

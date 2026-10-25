// Маршруты записанных трейсов (папка traces/):
//   GET /api/traces                — список: что за трейс, вопрос, когда, дописан ли до конца;
//   GET /api/traces/:file/events   — его события тем же потоком SSE, что у живой сессии.
//
// Поток отдаёт события сразу, без исходных пауз: время каждого события есть в timestamp,
// а темп воспроизведения — забота интерфейса (там же пауза, перемотка, шаг вперёд).

import type { FastifyInstance } from 'fastify';
import { openEventStream } from '../sse/openEventStream.js';
import { formatEnd, formatEvent, parseLastEventId } from '../sse/sseMessages.js';
import type { TraceCatalog } from './TraceCatalog.js';

// Последнее сообщение потока трейса (event: end).
export interface TraceStreamEnd {
  file: string;
  eventCount: number;
  // Строки трейса, которые не разобрались и пропущены.
  skippedLines: number;
}

interface TraceParams {
  file: string;
}

interface EventsQuery {
  after?: string;
}

export function registerTraceRoutes(app: FastifyInstance, catalog: TraceCatalog): void {
  app.get('/api/traces', () => catalog.list());

  app.get<{ Params: TraceParams; Querystring: EventsQuery }>(
    '/api/traces/:file/events',
    async (request, reply) => {
      const { file } = request.params;
      const contents = await catalog.read(file);
      if (contents === null) {
        return reply.code(404).send({ error: 'Такого трейса нет в traces/' });
      }
      const lastEventId = parseLastEventId(request.headers['last-event-id'] ?? request.query.after);
      const socket = openEventStream(reply);
      for (const event of contents.events) {
        if (event.sequence > lastEventId) {
          socket.write(formatEvent(event));
        }
      }
      const end: TraceStreamEnd = {
        file,
        eventCount: contents.events.length,
        skippedLines: contents.skippedLines,
      };
      socket.end(formatEnd(end));
      return reply;
    },
  );
}

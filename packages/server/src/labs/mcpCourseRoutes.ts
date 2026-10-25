// Маршрут учебного курса про тулы и MCP (лаборатория MCP):
//   GET /api/mcp/course — события записанной сессии курса из examples/traces.
// Шаги курса интерфейс строит из этих событий сам (projectMcpCourse): сообщения протокола,
// описания тулов в запросе, бюджет prompt, решения политики — всё из настоящей записи.

import type { HarnessEvent } from '@harness-visualization/harness';
import type { FastifyInstance } from 'fastify';
import type { TraceCatalog } from '../traces/TraceCatalog.js';

// Сессия «найди информации об отпусках моих коллег»: MCP-сервер kedr, четыре запроса к модели.
export const MCP_COURSE_TRACE = '2026-10-25T14-49-33_19b7e04d.jsonl';

export interface McpCourseResponse {
  file: string;
  events: HarnessEvent[];
}

export function registerMcpCourseRoutes(app: FastifyInstance, courseCatalog: TraceCatalog): void {
  app.get('/api/mcp/course', async (_request, reply) => {
    const contents = await courseCatalog.read(MCP_COURSE_TRACE);
    if (contents === null) {
      return reply
        .code(404)
        .send({ error: `Нет трейса курса examples/traces/${MCP_COURSE_TRACE}` });
    }
    const response: McpCourseResponse = { file: MCP_COURSE_TRACE, events: contents.events };
    return response;
  });
}

// Ветка от шага записанного трейса (этап 9):
//   POST /api/sessions/branch  { traceFile, step, edit } — запустить ветку, ответить id сессии.
// Ветка — обычная живая сессия: тот же поток событий, разрешения и диалог, что у «Новый вопрос».
// Шаги до step — replay из трейса, с него — новый прогон (harness: branch/).

import { branchSessionInput } from '@harness-visualization/harness';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { TraceCatalog } from '../traces/TraceCatalog.js';
import { launchSession, type SessionRoutesOptions } from './sessionRoutes.js';

export const branchRequestSchema = z.object({
  traceFile: z.string().min(1),
  step: z.number().int().positive(),
  edit: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('replay') }),
    z.object({ kind: z.literal('toolResult'), toolCallId: z.string().min(1), content: z.string() }),
  ]),
});

export type BranchRequest = z.infer<typeof branchRequestSchema>;

export function registerBranchRoutes(
  app: FastifyInstance,
  options: SessionRoutesOptions & { catalog: TraceCatalog; tracesDirectory: string },
): void {
  app.post('/api/sessions/branch', async (request, reply) => {
    const parsed = branchRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.message });
    }
    const { traceFile, step, edit } = parsed.data;
    const contents = await options.catalog.read(traceFile);
    if (contents === null) {
      return reply.code(404).send({ error: 'Такого трейса нет в traces/' });
    }
    try {
      const input = branchSessionInput({
        loadedSettings: options.loadedSettings,
        projectRoot: options.projectRoot,
        sourceTracePath: `${options.tracesDirectory}/${traceFile}`,
        sourceEvents: contents.events,
        step,
        edit,
        workspaceDirectory: null,
      });
      const sessionId = await launchSession(input, `⑂ ${input.question}`, options);
      return await reply
        .code(201)
        .send({ sessionId, eventsUrl: `/api/sessions/${sessionId}/events` });
    } catch (error) {
      return reply
        .code(400)
        .send({ error: error instanceof Error ? error.message : String(error) });
    }
  });
}

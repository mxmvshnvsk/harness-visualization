// Лаборатория «Выбор токена» (этап 11):
//   GET  /api/token-lab              — прошлые прогоны лаборатории (свои и примеры)
//   POST /api/token-lab/runs         { question, reasoningEffort } — прогон: по запросу к модели
//                                    на каждую температуру, с logprobs; ответ — имя трейса
//   GET  /api/token-lab/runs/:file   — события прогона; вид интерфейс строит сам (projectTokenLab)
//   POST /api/token-lab/forks        { file, position, token } — развилка (этап 11.3): ответ
//                                    прогона при T = 1, токен position заменён на token, модель
//                                    продолжает; ответ — события нового трейса
// Прогон — обычный трейс в traces/: открывается и плеером.

import { runTokenFork, runTokenLab, type LoadedSettings } from '@harness-visualization/harness';
import type { FastifyInstance } from 'fastify';
import { basename } from 'node:path';
import { z } from 'zod';
import type { TraceCatalog, TraceSummary } from '../traces/TraceCatalog.js';
import type { HarnessEvent } from '@harness-visualization/harness';

export interface TokenLabResponse {
  runs: TraceSummary[];
}

export interface TokenLabRunResponse {
  file: string;
  events: HarnessEvent[];
}

const runRequestSchema = z.object({
  question: z.string().trim().min(1).max(2000),
  reasoningEffort: z.enum(['off', 'low', 'high', 'max']).default('off'),
});

export type TokenLabRunRequest = z.input<typeof runRequestSchema>;

const forkRequestSchema = z.object({
  file: z.string().min(1),
  position: z.number().int().min(0),
  token: z.string().min(1).max(200),
});

export type TokenLabForkRequest = z.input<typeof forkRequestSchema>;

export function registerTokenLabRoutes(
  app: FastifyInstance,
  options: { projectRoot: string; loadedSettings: LoadedSettings; catalog: TraceCatalog },
): void {
  app.get('/api/token-lab', async (): Promise<TokenLabResponse> => {
    const traces = await options.catalog.list();
    return { runs: traces.filter((trace) => trace.tokenLab && trace.tokenLabFork !== true) };
  });

  app.post('/api/token-lab/runs', async (request, reply) => {
    const parsed = runRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.message });
    }
    const tracePath = await runTokenLab({
      projectRoot: options.projectRoot,
      loadedSettings: options.loadedSettings,
      question: parsed.data.question,
      reasoningEffort: parsed.data.reasoningEffort,
    });
    return reply.code(201).send(await readRun(options.catalog, basename(tracePath)));
  });

  app.post('/api/token-lab/forks', async (request, reply) => {
    const parsed = forkRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.message });
    }
    const source = await options.catalog.read(parsed.data.file);
    if (source === null) {
      return reply.code(404).send({ error: 'Нет такого прогона' });
    }
    try {
      const tracePath = await runTokenFork({
        projectRoot: options.projectRoot,
        loadedSettings: options.loadedSettings,
        sourceFile: parsed.data.file,
        sourceEvents: source.events,
        position: parsed.data.position,
        token: parsed.data.token,
      });
      return await reply.code(201).send(await readRun(options.catalog, basename(tracePath)));
    } catch (error) {
      return reply
        .code(400)
        .send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get<{ Params: { file: string } }>('/api/token-lab/runs/:file', async (request, reply) => {
    const run = await readRun(options.catalog, request.params.file);
    return run === null ? reply.code(404).send({ error: 'Нет такого прогона' }) : run;
  });
}

async function readRun(catalog: TraceCatalog, file: string): Promise<TokenLabRunResponse | null> {
  const contents = await catalog.read(file);
  return contents === null ? null : { file, events: contents.events };
}

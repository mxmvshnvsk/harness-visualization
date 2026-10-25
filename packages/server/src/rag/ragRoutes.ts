// Маршруты лаборатории RAG (этап 8b):
//   GET  /api/rag/base             — документы базы, их фрагменты и векторы, вопросы-примеры;
//   GET  /api/rag/index            — где живут векторы: файл индекса, запись из него, модель;
//   POST /api/rag/search {query}   — три выдачи (по словам, по смыслу, гибрид) и сходство с фрагментами;
//   POST /api/rag/embed {texts}    — векторы фраз: «две фразы» и учебная карта;
//   GET  /api/rag/grounding/:file  — проверка опоры ответа записанной сессии;
//   GET  /api/rag/course/grounding — то же для учебного трейса курса (examples/traces).
// Модели эмбеддингов нет — 503 с подсказкой: pnpm rag-index.

import { ModelMissingError } from '@harness-visualization/embeddings';
import { KnowledgeBaseLab } from '@harness-visualization/mcp-server/lab';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { TraceCatalog } from '../traces/TraceCatalog.js';
import { buildGroundingReport } from './groundingReport.js';

const searchSchema = z.object({ query: z.string().trim().min(1).max(300) });
// Учебной карте хватает десятка фраз; больше — это уже не лаборатория, а нагрузка.
const embedSchema = z.object({ texts: z.array(z.string().trim().min(1).max(300)).min(1).max(20) });

export interface RagRoutesOptions {
  catalog: TraceCatalog;
  // Трейсы курса из репозитория: синтетический ответ с ошибками и проверка его судьёй.
  courseCatalog: TraceCatalog;
  similarityThreshold: number;
}

// Ответ агента про удалёнку с четырьмя подложенными ошибками — опыт шага «Проверка ответа».
export const COURSE_GROUNDING_TRACE = 'synthetic-53863eac-errors.jsonl';

export function registerRagRoutes(app: FastifyInstance, options: RagRoutesOptions): void {
  // Лаборатория открывается при первом запросе: серверу незачем грузить модель, пока экран не открыт.
  let opening: Promise<KnowledgeBaseLab> | null = null;
  const lab = (): Promise<KnowledgeBaseLab> => (opening ??= KnowledgeBaseLab.open());

  app.get('/api/rag/base', (_request, reply) => withModel(reply, async () => (await lab()).base()));
  app.get('/api/rag/index', (_request, reply) =>
    withModel(reply, async () => (await lab()).indexFile()),
  );

  app.post('/api/rag/search', (request, reply) => {
    const parsed = searchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Нужен query: строка от 1 до 300 символов' });
    }
    return withModel(reply, async () => (await lab()).search(parsed.data.query));
  });

  app.post('/api/rag/embed', (request, reply) => {
    const parsed = embedSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Нужен texts: от 1 до 20 строк до 300 символов' });
    }
    return withModel(reply, async () => ({
      vectors: await (await lab()).embed(parsed.data.texts),
    }));
  });

  const grounding = async (reply: FastifyReply, catalog: TraceCatalog, file: string) => {
    const contents = await catalog.read(file);
    if (contents === null) {
      return reply.code(404).send({ error: 'Такого трейса нет' });
    }
    return withModel(reply, async () =>
      buildGroundingReport({
        file,
        events: contents.events,
        embedder: await (await lab()).embedder(),
        catalog,
        similarityThreshold: options.similarityThreshold,
      }),
    );
  };

  app.get<{ Params: { file: string } }>('/api/rag/grounding/:file', (request, reply) =>
    grounding(reply, options.catalog, request.params.file),
  );
  app.get('/api/rag/course/grounding', (_request, reply) =>
    grounding(reply, options.courseCatalog, COURSE_GROUNDING_TRACE),
  );
}

async function withModel<Result>(
  reply: FastifyReply,
  work: () => Promise<Result>,
): Promise<Result | FastifyReply> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ModelMissingError) {
      return reply.code(503).send({
        error: 'Модель эмбеддингов не скачана. Запустите pnpm rag-index в корне проекта.',
      });
    }
    throw error;
  }
}

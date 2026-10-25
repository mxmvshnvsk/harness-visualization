// Маршруты лаборатории RAG (этап 8b):
//   GET  /api/rag/base             — документы базы, их фрагменты и векторы, вопросы-примеры;
//   POST /api/rag/search {query}   — три выдачи (по словам, по смыслу, гибрид) и сходство с фрагментами;
//   POST /api/rag/embed {texts}    — векторы фраз: «две фразы» и учебная карта;
//   GET  /api/rag/grounding/:file  — проверка опоры ответа записанной сессии.
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
  similarityThreshold: number;
}

export function registerRagRoutes(app: FastifyInstance, options: RagRoutesOptions): void {
  // Лаборатория открывается при первом запросе: серверу незачем грузить модель, пока экран не открыт.
  let opening: Promise<KnowledgeBaseLab> | null = null;
  const lab = (): Promise<KnowledgeBaseLab> => (opening ??= KnowledgeBaseLab.open());

  app.get('/api/rag/base', (_request, reply) => withModel(reply, async () => (await lab()).base()));

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

  app.get<{ Params: { file: string } }>('/api/rag/grounding/:file', async (request, reply) => {
    const { file } = request.params;
    const contents = await options.catalog.read(file);
    if (contents === null) {
      return reply.code(404).send({ error: 'Такого трейса нет в traces/' });
    }
    return withModel(reply, async () =>
      buildGroundingReport({
        file,
        events: contents.events,
        embedder: await (await lab()).embedder(),
        catalog: options.catalog,
        similarityThreshold: options.similarityThreshold,
      }),
    );
  });
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

// Код-арена (этап 10):
//   GET  /api/arena/tasks  — заготовленные задачи с текстом и числом видимых и скрытых тестов;
//   POST /api/arena/runs   { taskId, runTests, reasoningEffort, contextPreset?, maxIterations? }
//                          — копия проекта и живая сессия-прогон; ответ — как у новой сессии.
// Прогон — обычная сессия: тот же поток событий, разрешения и диалог, что у «Новый вопрос».

import {
  arenaRoot,
  arenaSessionInput,
  countTaskTests,
  listArenaTasks,
  networkClosedByPermissions,
  prepareArenaRun,
  readArenaTask,
  type ArenaTaskDetails,
} from '@harness-visualization/harness';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { launchSession, type SessionRoutesOptions } from '../sessions/sessionRoutes.js';

export interface ArenaTaskSummary extends ArenaTaskDetails {
  visibleTests: number;
  hiddenTests: number;
}

export interface ArenaTasksResponse {
  tasks: ArenaTaskSummary[];
  // Настройки прогона по умолчанию — из раздела arena harness.config.json.
  defaults: {
    contextPreset: 'demo' | 'stress' | 'real';
    maxIterations: number;
    reasoningEffort: 'off' | 'low' | 'high' | 'max';
  };
  nodeVersion: string;
  // Закрыта ли сеть для тестов: модель разрешений Node закрывает её с версии 25.
  network: 'closed' | 'open';
}

export const arenaRunRequestSchema = z.object({
  taskId: z.string().min(1),
  runTests: z.boolean(),
  reasoningEffort: z.enum(['off', 'low', 'high', 'max']),
  contextPreset: z.enum(['demo', 'stress', 'real']).nullable().default(null),
  maxIterations: z.number().int().positive().max(100).nullable().default(null),
});

export type ArenaRunRequest = z.input<typeof arenaRunRequestSchema>;

export function registerArenaRoutes(app: FastifyInstance, options: SessionRoutesOptions): void {
  const { settings } = options.loadedSettings;
  const root = arenaRoot(options.projectRoot, settings.arena);

  app.get('/api/arena/tasks', async (): Promise<ArenaTasksResponse> => {
    const tasks = await listArenaTasks(root);
    const summaries = await Promise.all(
      tasks.map(async (task) => {
        const details = await readArenaTask(root, task.id);
        const counts = await countTaskTests(root, task.id);
        return { ...details, visibleTests: counts.visible, hiddenTests: counts.hidden };
      }),
    );
    return {
      tasks: summaries,
      defaults: {
        contextPreset: settings.arena.contextPreset,
        maxIterations: settings.arena.maxIterations,
        reasoningEffort: settings.model.defaultReasoningEffort,
      },
      nodeVersion: process.versions.node,
      network: networkClosedByPermissions() ? 'closed' : 'open',
    };
  });

  app.post('/api/arena/runs', async (request, reply) => {
    const parsed = arenaRunRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.message });
    }
    const { taskId, runTests, reasoningEffort, contextPreset, maxIterations } = parsed.data;
    try {
      const arena = await prepareArenaRun({
        projectRoot: options.projectRoot,
        settings: settings.arena,
        taskId,
        runTests,
        // Запуск подтверждают в «Диалоге», как разрешения других тулов.
        runNode: true,
        contextPreset,
        maxIterations,
      });
      const input = arenaSessionInput({
        loadedSettings: options.loadedSettings,
        projectRoot: options.projectRoot,
        arena,
        reasoningEffort,
        question: null,
      });
      const title = `Код-арена: ${arena.task?.title ?? taskId}`;
      const sessionId = await launchSession(input, title, options);
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

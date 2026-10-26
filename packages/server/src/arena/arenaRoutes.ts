// Код-арена (этап 10):
//   GET  /api/arena/tasks  — заготовленные задачи с текстом и числом видимых и скрытых тестов;
//   POST /api/arena/runs   { taskId, runTests, reasoningEffort, contextPreset?, maxIterations? }
//                          — копия проекта и живая сессия-прогон; ответ — как у новой сессии.
//   GET  /api/arena/projects — проекты свободного режима (этап 10.4);
//   POST /api/arena/free   { project, source, copyFrom?, question, reasoningEffort }
//                          — новый проект, продолжение или копия папки; дальше — диалог.
// Прогон — обычная сессия: тот же поток событий, разрешения и диалог, что у «Новый вопрос».

import {
  arenaRoot,
  arenaSessionInput,
  countTaskTests,
  listArenaTasks,
  listFreeProjects,
  prepareFreeRun,
  type FreeProject,
  sandboxInfo,
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
  // Закрыта ли сеть для тестов: модель разрешений Node закрывает её с версии 25, Docker — всегда.
  network: 'closed' | 'open';
  // Песочница из arena.sandbox; image — образ Docker, null у node.
  sandbox: 'node' | 'docker';
  image: string | null;
  // Docker выбран, но не отвечает: прогон не запустится, интерфейс скажет почему.
  sandboxError: string | null;
}

export const arenaRunRequestSchema = z.object({
  taskId: z.string().min(1),
  runTests: z.boolean(),
  reasoningEffort: z.enum(['off', 'low', 'high', 'max']),
  contextPreset: z.enum(['demo', 'stress', 'real']).nullable().default(null),
  maxIterations: z.number().int().positive().max(100).nullable().default(null),
});

export type ArenaRunRequest = z.input<typeof arenaRunRequestSchema>;

export const freeRunRequestSchema = z.object({
  project: z.string().min(1),
  source: z.enum(['new', 'continue', 'copy']),
  // Абсолютный путь папки на этой машине — для source: copy.
  copyFrom: z.string().nullable().default(null),
  question: z.string().min(1),
  reasoningEffort: z.enum(['off', 'low', 'high', 'max']),
});

export type FreeRunRequest = z.input<typeof freeRunRequestSchema>;

export interface FreeProjectsResponse {
  projects: FreeProject[];
  // Где лежат проекты — путь от корня репозитория.
  directory: string;
}

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
      ...(await describeSandbox(settings.arena)),
    };
  });

  registerFreeRoutes(app, options);

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

// Свободный режим (этап 10.4): проекты в workspaces/arena/free и запуск по ним.
function registerFreeRoutes(app: FastifyInstance, options: SessionRoutesOptions): void {
  const { settings } = options.loadedSettings;
  app.get('/api/arena/projects', async (): Promise<FreeProjectsResponse> => ({
    projects: await listFreeProjects(options.projectRoot, settings.arena),
    directory: `${settings.arena.workspaceDirectory}/free`,
  }));

  app.post('/api/arena/free', async (request, reply) => {
    const parsed = freeRunRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.message });
    }
    const { project, source, copyFrom, question, reasoningEffort } = parsed.data;
    try {
      const arena = await prepareFreeRun({
        projectRoot: options.projectRoot,
        settings: settings.arena,
        name: project,
        source: source === 'copy' ? { kind: 'copy', from: copyFrom ?? '' } : { kind: source },
      });
      const input = arenaSessionInput({
        loadedSettings: options.loadedSettings,
        projectRoot: options.projectRoot,
        arena,
        reasoningEffort,
        question,
      });
      const sessionId = await launchSession(input, `Код-арена · ${project}`, options);
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

async function describeSandbox(
  arena: Parameters<typeof sandboxInfo>[0],
): Promise<
  Pick<ArenaTasksResponse, 'nodeVersion' | 'network' | 'sandbox' | 'image' | 'sandboxError'>
> {
  try {
    const info = await sandboxInfo(arena);
    return { ...info, sandbox: info.kind, sandboxError: null };
  } catch (error) {
    return {
      nodeVersion: '?',
      network: 'closed',
      sandbox: arena.sandbox,
      image: arena.docker.image,
      sandboxError: error instanceof Error ? error.message : String(error),
    };
  }
}

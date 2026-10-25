// Сервер для браузера: запускает сессии харнесса и отдаёт поток их событий.
// Только маршруты и реестр; сеть, модель, тулы — всё в харнессе (startSession).

import { join } from 'node:path';
import type { LoadedSettings } from '@harness-visualization/harness';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerDebugPage } from './debugPage.js';
import { registerUiPages } from './uiPages.js';
import { PendingPermissions } from './permissions/PendingPermissions.js';
import { PendingQuestions } from './sessions/PendingQuestions.js';
import { SessionRegistry } from './sessions/SessionRegistry.js';
import { registerSessionRoutes } from './sessions/sessionRoutes.js';
import { TraceCatalog } from './traces/TraceCatalog.js';
import { registerTraceRoutes } from './traces/traceRoutes.js';

// Сколько ждать идущие сессии при остановке. Ход агента после отказа — ещё один запрос
// к модели, обычно несколько секунд; дольше ждать незачем — пусть трейс лучше оборвётся.
const SHUTDOWN_WAIT_MS = 10000;

export interface ServerOptions {
  loadedSettings: LoadedSettings;
  projectRoot: string;
}

export function createServer(options: ServerOptions): FastifyInstance {
  // Журнал запросов Fastify выключен: всё, что происходит в сессии, видно в её событиях.
  const app = Fastify({ logger: false });
  const permissions = new PendingPermissions(
    options.loadedSettings.settings.server.permissionTimeoutSeconds * 1000,
  );
  const questions = new PendingQuestions(
    options.loadedSettings.settings.server.questionTimeoutSeconds * 1000,
  );
  const registry = new SessionRegistry();
  registerSessionRoutes(app, { ...options, registry, permissions, questions });
  const { traces } = options.loadedSettings.settings;
  registerTraceRoutes(app, new TraceCatalog(join(options.projectRoot, traces.directory)));
  registerUiPages(app);
  registerDebugPage(app);
  // Сервер останавливают (Ctrl+C). Ждущие вопросы закрываются отказом noOneToAsk, диалоги,
  // ждущие следующего вопроса, заканчиваются, а идущие
  // сессии получают время дописать трейс до session_finished — иначе трейс обрывается
  // посреди хода. preClose, а не onClose: пока открыты потоки SSE живых сессий, Fastify
  // не закроется, а закрываются они как раз концом сессий.
  app.addHook('preClose', async () => {
    permissions.denyAll();
    questions.endAll();
    const running = registry.runningCount();
    if (running > 0) {
      console.log(`Остановка: жду, пока сессии допишут трейсы (${String(running)})…`);
      const unfinished = await registry.waitForRunning(SHUTDOWN_WAIT_MS);
      if (unfinished > 0) {
        console.log(`Не дождался ${String(unfinished)} — их трейсы оборвутся.`);
      }
    }
  });
  return app;
}

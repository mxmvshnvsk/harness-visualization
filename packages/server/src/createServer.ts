// Сервер для браузера: запускает сессии харнесса и отдаёт поток их событий.
// Только маршруты и реестр; сеть, модель, тулы — всё в харнессе (startSession).

import type { LoadedSettings } from '@harness-visualization/harness';
import Fastify, { type FastifyInstance } from 'fastify';
import { PendingPermissions } from './permissions/PendingPermissions.js';
import { SessionRegistry } from './sessions/SessionRegistry.js';
import { registerSessionRoutes } from './sessions/sessionRoutes.js';

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
  registerSessionRoutes(app, { ...options, registry: new SessionRegistry(), permissions });
  // Сервер останавливают — ждущие вопросы закрываются отказом, сессии дописывают трейсы.
  app.addHook('onClose', (_instance, done) => {
    permissions.denyAll();
    done();
  });
  return app;
}

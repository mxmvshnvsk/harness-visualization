// Точка входа pnpm serve: сервер на 127.0.0.1 и порту из harness.config.json (server.port);
// он же отдаёт собранный интерфейс.
// Только локальный адрес: авторизации нет, а сессия тратит деньги владельца ключа модели.

import { loadSettings } from '@harness-visualization/harness';
import { createServer } from './createServer.js';

const HOST = '127.0.0.1';

async function main(): Promise<void> {
  // Команда запускается из корня репозитория, там лежат harness.config.json и .env.
  const projectRoot = process.cwd();
  const loadedSettings = await loadSettings(projectRoot, { requireModelKey: false });
  const app = createServer({ loadedSettings, projectRoot });
  const { port } = loadedSettings.settings.server;
  await app.listen({ host: HOST, port });
  const url = `http://${HOST}:${String(port)}`;
  console.log(`Интерфейс: ${url}  ·  отладочная страница: ${url}/debug`);
  const stop = (): void => {
    void app.close().then(() => process.exit(0));
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

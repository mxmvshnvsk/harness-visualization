// Точка входа pnpm server: сервер на 127.0.0.1 и порту из harness.config.json (server.port).
// Только локальный адрес: авторизации нет, а сессия тратит деньги владельца ключа модели.

import { loadSettings } from '@harness-visualization/harness';
import { createServer } from './createServer.js';

const HOST = '127.0.0.1';

async function main(): Promise<void> {
  // Команда запускается из корня репозитория, там лежат harness.config.json и .env.
  const projectRoot = process.cwd();
  const loadedSettings = await loadSettings(projectRoot);
  const app = createServer({ loadedSettings, projectRoot });
  const { port } = loadedSettings.settings.server;
  await app.listen({ host: HOST, port });
  console.log(`Сервер харнесса: http://${HOST}:${String(port)}`);
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

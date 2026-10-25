// GET /debug — отладочная страница (packages/server/public/debug.html). Файл читается при каждом
// запросе: правку страницы видно после обновления вкладки, без перезапуска сервера.
// Без @fastify/static: файл один, а так видно, что именно сервер отдаёт.

import { readFile } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';

// dist/debugPage.js → ../public/debug.html
const DEBUG_PAGE = new URL('../public/debug.html', import.meta.url);

// Страница не грузит ничего со стороны: скрипт и стили встроены, запросы — только к этому серверу.
const CONTENT_SECURITY_POLICY =
  "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'";

export function registerDebugPage(app: FastifyInstance): void {
  app.get('/debug', async (_request, reply) => {
    const html = await readFile(DEBUG_PAGE, 'utf8');
    return reply
      .header('content-type', 'text/html; charset=utf-8')
      .header('content-security-policy', CONTENT_SECURITY_POLICY)
      .send(html);
  });
}

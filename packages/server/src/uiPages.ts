// Собранный интерфейс (packages/ui/dist) с этого же сервера: pnpm serve — и в браузере сразу
// интерфейс, без Vite. Файлов немного — главная страница и assets/ с хэшами в именах, — поэтому
// без @fastify/static: так видно, что именно сервер отдаёт и откуда.
//
// GET / — index.html; GET /assets/* — скрипты, стили и шрифты. Интерфейс не собран
// (pnpm dev или сборка не запускалась) — на / подсказка, как собрать, и ссылка на /debug.

import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance, FastifyReply } from 'fastify';

// dist/uiPages.js → ../../ui/dist/
const UI_DIST = new URL('../../ui/dist/', import.meta.url);

const TYPES: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

// Скрипт темы в index.html встроен — ему нужен 'unsafe-inline'; всё остальное — только отсюда.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
].join('; ');

// Имя файла в assets/ — только буквы, цифры, точка, дефис и подчёркивание: ни «..», ни «/».
const ASSET_NAME = /^[\w.-]+$/;

export function registerUiPages(app: FastifyInstance): void {
  app.get('/', async (_request, reply) => {
    const html = await readOrNull(new URL('index.html', UI_DIST));
    if (html === null) {
      return reply.code(503).header('content-type', 'text/html; charset=utf-8').send(NOT_BUILT);
    }
    return sendPage(reply, html);
  });
  app.get<{ Params: { name: string } }>('/assets/:name', async (request, reply) => {
    const { name } = request.params;
    const type = TYPES[extname(name)];
    if (!ASSET_NAME.test(name) || name.startsWith('.') || type === undefined) {
      return reply.code(404).send();
    }
    const file = await readOrNull(new URL(`assets/${name}`, UI_DIST));
    if (file === null) {
      return reply.code(404).send();
    }
    // В имени хэш содержимого: файл с этим именем не изменится — кэшируем надолго.
    return reply
      .header('content-type', type)
      .header('cache-control', 'public, max-age=31536000, immutable')
      .send(file);
  });
}

function sendPage(reply: FastifyReply, html: Buffer): FastifyReply {
  // Страницу не кэшируем: после пересборки она ссылается на новые assets.
  return reply
    .header('content-type', 'text/html; charset=utf-8')
    .header('cache-control', 'no-cache')
    .header('content-security-policy', CONTENT_SECURITY_POLICY)
    .send(html);
}

async function readOrNull(url: URL): Promise<Buffer | null> {
  try {
    return await readFile(fileURLToPath(url));
  } catch {
    return null;
  }
}

const NOT_BUILT = `<!doctype html>
<meta charset="utf-8">
<title>Интерфейс не собран</title>
<p>Интерфейс не собран: запустите <code>pnpm serve</code> (соберёт и запустит)
или <code>pnpm dev</code> (интерфейс на http://127.0.0.1:5173).</p>
<p>Отладочная страница сервера — <a href="/debug">/debug</a>.</p>`;

// Открывает ответ как поток SSE. Ответ пишется руками в сокет (reply.hijack): Fastify не знает
// про SSE, а нам и не нужно — формат простой и виден целиком (sseMessages.ts).

import type { ServerResponse } from 'node:http';
import type { FastifyReply } from 'fastify';
import { formatRetry } from './sseMessages.js';

export function openEventStream(reply: FastifyReply): ServerResponse {
  reply.hijack();
  const socket = reply.raw;
  socket.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });
  socket.write(formatRetry());
  return socket;
}

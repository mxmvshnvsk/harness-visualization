// Импорт записи чужого харнесса (этап 9.4):
//   POST /api/traces/import  { format: 'auto' | 'claude-code' | 'opencode', text }
//                            — перевести и сохранить в traces/; auto — формат по содержимому.
// Запись передаётся текстом из браузера (выбор файла), сервер переводит её адаптером
// харнесса, маскирует ключи и домашнюю папку и отвечает именем нового трейса.

import {
  convertImported,
  detectImportFormat,
  IMPORT_PREFIXES,
  writeImportedTrace,
} from '@harness-visualization/harness';
import type { FastifyInstance } from 'fastify';
import { basename } from 'node:path';
import { z } from 'zod';

// Сессия Claude Code на несколько часов — десятки мегабайт: обычных 1 МБ Fastify мало.
const IMPORT_BODY_LIMIT = 200 * 1024 * 1024;

export interface ImportTraceResponse {
  file: string;
  eventCount: number;
}

const importRequestSchema = z.object({
  format: z.enum(['auto', 'claude-code', 'opencode']).default('auto'),
  text: z.string().min(1),
});

export function registerImportRoutes(app: FastifyInstance, tracesDirectory: string): void {
  app.post('/api/traces/import', { bodyLimit: IMPORT_BODY_LIMIT }, async (request, reply) => {
    const parsed = importRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.message });
    }
    try {
      const { format, text } = parsed.data;
      const resolved = format === 'auto' ? detectImportFormat(text) : format;
      const events = convertImported(text, resolved);
      const filePath = await writeImportedTrace(tracesDirectory, events, IMPORT_PREFIXES[resolved]);
      const response: ImportTraceResponse = { file: basename(filePath), eventCount: events.length };
      return await reply.code(201).send(response);
    } catch (error) {
      return reply
        .code(400)
        .send({ error: error instanceof Error ? error.message : String(error) });
    }
  });
}

// Тул semantic_search — поиск по смыслу: фрагменты документов, чьи векторы ближе
// всего к вектору запроса. Может найти ответ, даже если в вопросе нет ни одного слова
// из документа: «сколько можно отдыхать» → регламент об отпусках.

import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { SemanticHit } from '../semanticSearch/rankChunks.js';
import type { SemanticIndex } from '../semanticSearch/SemanticIndex.js';
import { READ_ONLY_ANNOTATIONS } from './readOnlyAnnotations.js';

const DEFAULT_SEARCH_LIMIT = 5;
const MAX_SEARCH_LIMIT = 20;
const SIMILARITY_DIGITS = 3;

export function registerSemanticSearchTool(server: McpServer, index: SemanticIndex): void {
  server.registerTool(
    'semantic_search',
    {
      title: 'Поиск по смыслу',
      description:
        'Ищет в базе знаний компании «Кедр Софт» фрагменты документов, близкие запросу по смыслу, ' +
        'а не по словам: находит ответ, даже если он сформулирован другими словами. ' +
        'Возвращает фрагменты с id документа и сходством с запросом (чем больше, тем ближе). ' +
        'Для точных названий, номеров и имён лучше подходит search. ' +
        'Чтобы прочитать документ целиком, используй read_document.',
      inputSchema: z.object({
        query: z
          .string()
          .min(1)
          .describe('Вопрос или описание того, что нужно найти, обычными словами'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_SEARCH_LIMIT)
          .optional()
          .describe(`Сколько фрагментов вернуть, по умолчанию ${DEFAULT_SEARCH_LIMIT}`),
      }),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ query, limit }) => {
      try {
        const hits = await index.search(query, limit ?? DEFAULT_SEARCH_LIMIT);
        return { content: [{ type: 'text', text: hits.map(describeHit).join('\n\n') }] };
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: 'text', text: `Поиск по смыслу недоступен. ${reason}` }],
        };
      }
    },
  );
}

// Первой строкой — id документа: по нему проверка опоры ответа (check-grounding)
// узнаёт, что модель видела фрагмент этого документа.
function describeHit(hit: SemanticHit): string {
  const { chunk } = hit.indexed;
  const { document } = chunk;
  const header =
    `${document.id} — ${document.title} (${document.type}, ${document.date ?? 'без даты'}), ` +
    `фрагмент ${chunk.position} из ${chunk.totalInDocument}, ` +
    `сходство ${hit.similarity.toFixed(SIMILARITY_DIGITS)}`;
  return `${header}\n${chunk.text}`;
}

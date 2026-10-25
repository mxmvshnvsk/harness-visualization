// Тул hybrid_search — поиск сразу по словам и по смыслу. Сравнение на этапе 5.2 показало,
// что они ошибаются по-разному: по словам не понимает перефразирования, по смыслу теряет
// короткие запросы и слова из тегов. Гибрид чаще ставит нужный документ в первую тройку.

import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { SearchSources } from '../hybridSearch/rankByWordsAndMeaning.js';
import { searchHybrid, type HybridHit } from '../hybridSearch/searchHybrid.js';
import { READ_ONLY_ANNOTATIONS } from './readOnlyAnnotations.js';

const DEFAULT_SEARCH_LIMIT = 5;
const MAX_SEARCH_LIMIT = 20;

export function registerHybridSearchTool(server: McpServer, sources: SearchSources): void {
  server.registerTool(
    'hybrid_search',
    {
      title: 'Поиск по словам и по смыслу',
      description:
        'Ищет в базе знаний компании «Кедр Софт» сразу по словам и по смыслу и объединяет обе выдачи. ' +
        'Возвращает документы с лучшим фрагментом каждого и местами в обеих выдачах. ' +
        'Подходит, когда неясно, как сформулирован ответ в документах. ' +
        'Чтобы прочитать документ целиком, используй read_document.',
      inputSchema: z.object({
        query: z.string().min(1).describe('Вопрос или слова для поиска'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_SEARCH_LIMIT)
          .optional()
          .describe(`Сколько документов вернуть, по умолчанию ${DEFAULT_SEARCH_LIMIT}`),
      }),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ query, limit }) => {
      try {
        const hits = await searchHybrid(query, limit ?? DEFAULT_SEARCH_LIMIT, sources);
        return { content: [{ type: 'text', text: hits.map(describeHit).join('\n\n') }] };
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: 'text', text: `Гибридный поиск недоступен. ${reason}` }],
        };
      }
    },
  );
}

// Первой строкой — id документа: по нему check-grounding узнаёт, что модель видела фрагмент.
function describeHit(hit: HybridHit): string {
  const { chunk } = hit.bestChunk.indexed;
  const { document } = chunk;
  const header =
    `${document.id} — ${document.title} (${document.type}, ${document.date ?? 'без даты'}), ` +
    `фрагмент ${chunk.position} из ${chunk.totalInDocument}, ` +
    `по словам: ${describePlace(hit.wordsPlace)}, по смыслу: ${describePlace(hit.meaningPlace)}`;
  return `${header}\n${chunk.text}`;
}

function describePlace(place: number | null): string {
  return place === null ? 'не найден' : `${place}-е место`;
}

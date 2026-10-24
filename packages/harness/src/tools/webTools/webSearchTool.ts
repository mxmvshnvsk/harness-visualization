// Тул web_search: ищет в интернете через поискового провайдера (сейчас — Tavily).

import { z } from 'zod';
import type { SearchProvider, SearchResult } from '../../search/searchProvider.js';
import { defineTool } from '../defineTool.js';
import type { Tool } from '../toolTypes.js';

const MAX_RESULTS_LIMIT = 10;

export function createWebSearchTool(provider: SearchProvider, defaultMaxResults: number): Tool {
  return defineTool({
    name: 'web_search',
    description:
      'Ищет в интернете и возвращает список результатов: заголовок, адрес и фрагмент страницы. ' +
      'Чтобы прочитать страницу целиком, используй fetch_url.',
    argumentsSchema: z.object({
      query: z.string().min(1).describe('Поисковый запрос'),
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(MAX_RESULTS_LIMIT)
        .optional()
        .describe(`Сколько результатов вернуть, по умолчанию ${defaultMaxResults}`),
    }),
    async execute(toolArguments) {
      const response = await provider.search(
        toolArguments.query,
        toolArguments.maxResults ?? defaultMaxResults,
      );
      if (response.results.length === 0) {
        return {
          content: `По запросу «${toolArguments.query}» ничего не найдено`,
          details: response.details,
        };
      }
      return {
        content: response.results.map(describeResult).join('\n\n'),
        details: response.details,
      };
    },
  });
}

function describeResult(result: SearchResult, index: number): string {
  return `${index + 1}. ${result.title}\n${result.url}\n${result.snippet}`;
}

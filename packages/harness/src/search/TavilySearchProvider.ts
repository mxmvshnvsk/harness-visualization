// Поиск через Tavily — поисковый API, рассчитанный на ИИ-агентов:
// возвращает не только ссылки, но и подходящие фрагменты страниц.

import { z } from 'zod';
import { describeFetchFailure } from '../http/describeFetchFailure.js';
import { HARNESS_USER_AGENT } from '../http/userAgent.js';
import type { SearchSettings } from '../settings/settingsSchema.js';
import { ToolError } from '../tools/ToolError.js';
import type { SearchProvider, SearchResponse } from './searchProvider.js';

const tavilyResponseSchema = z.object({
  results: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
      content: z.string(),
      score: z.number().optional(),
    }),
  ),
  response_time: z.union([z.number(), z.string()]).optional(),
  usage: z.object({ credits: z.number().optional() }).optional(),
});

// Tavily описывает ошибку так: { "detail": { "error": "..." } }.
const tavilyErrorSchema = z.object({
  detail: z.object({ error: z.string() }),
});

export class TavilySearchProvider implements SearchProvider {
  readonly name = 'tavily';
  private readonly settings: SearchSettings;
  private readonly apiKey: string;

  constructor(settings: SearchSettings, apiKey: string) {
    this.settings = settings;
    this.apiKey = apiKey;
  }

  async search(query: string, maxResults: number): Promise<SearchResponse> {
    const response = await this.sendSearchRequest(query, maxResults);
    const body = parseJsonOrKeepText(await response.text());
    if (!response.ok) {
      throw new ToolError(describeTavilyError(response.status, body));
    }
    const validation = tavilyResponseSchema.safeParse(body);
    if (!validation.success) {
      throw new ToolError(`Непонятный ответ Tavily:\n${validation.error.message}`);
    }
    const data = validation.data;
    return {
      results: data.results.map((result) => ({
        title: result.title,
        url: result.url,
        snippet: result.content,
        score: result.score ?? null,
      })),
      details: {
        provider: this.name,
        searchDepth: this.settings.searchDepth,
        credits: data.usage?.credits ?? null,
        responseTimeSeconds: data.response_time ?? null,
        resultCount: data.results.length,
      },
    };
  }

  private async sendSearchRequest(query: string, maxResults: number): Promise<Response> {
    const baseWithSlash = this.settings.baseUrl.endsWith('/')
      ? this.settings.baseUrl
      : `${this.settings.baseUrl}/`;
    try {
      return await fetch(new URL('search', baseWithSlash), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': HARNESS_USER_AGENT,
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          query,
          max_results: maxResults,
          search_depth: this.settings.searchDepth,
          // Просим Tavily сообщить, сколько кредитов стоил запрос, — это часть токеномики.
          include_usage: true,
        }),
        signal: AbortSignal.timeout(this.settings.requestTimeoutMs),
      });
    } catch (error) {
      throw new ToolError(`Не удалось связаться с Tavily: ${describeFetchFailure(error)}`);
    }
  }
}

const MAX_ERROR_BODY_LENGTH = 300;

// Сначала ищем ошибку в формате Tavily, иначе показываем начало ответа как есть:
// причина отказа (неверный ключ, лимит, ограничение сети) обычно написана там.
function describeTavilyError(status: number, body: unknown): string {
  const summary = `Tavily ответил ошибкой HTTP ${status}`;
  const errorValidation = tavilyErrorSchema.safeParse(body);
  if (errorValidation.success) {
    return `${summary}: ${errorValidation.data.detail.error}`;
  }
  const bodyText = typeof body === 'string' ? body : JSON.stringify(body);
  if (bodyText === '' || bodyText === 'null') {
    return `${summary}, тело ответа пустое`;
  }
  const compactBody = bodyText.replace(/\s+/g, ' ').trim();
  return `${summary}: ${compactBody.slice(0, MAX_ERROR_BODY_LENGTH)}`;
}

function parseJsonOrKeepText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

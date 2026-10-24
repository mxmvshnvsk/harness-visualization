// Поиск через Yandex Search API (Yandex Cloud).
// Ответ приходит как XML, закодированный в Base64, — его нужно раскодировать и разобрать.
// Это наглядно в трейсе: сколько пришло от Яндекса и сколько текста ушло модели.

import { z } from 'zod';
import { describeFetchFailure } from '../http/describeFetchFailure.js';
import { HARNESS_USER_AGENT } from '../http/userAgent.js';
import type { YandexSearchSettings } from '../settings/settingsSchema.js';
import { ToolError } from '../tools/ToolError.js';
import { parseYandexSearchXml } from './parseYandexSearchXml.js';
import type { SearchProvider, SearchResponse } from './searchProvider.js';
import { calculateYandexSearchCost } from './yandexSearchCost.js';

const WEB_SEARCH_PATH = 'v2/web/search';
const MAX_ERROR_BODY_LENGTH = 300;

const yandexResponseSchema = z.object({
  rawData: z.string(),
});

// Ошибки API Yandex Cloud: { "code": 7, "message": "Permission denied" }.
const yandexErrorSchema = z.object({
  message: z.string(),
});

export interface YandexCredentials {
  apiKey: string;
  folderId: string;
}

export class YandexSearchProvider implements SearchProvider {
  readonly name = 'yandex';
  private readonly settings: YandexSearchSettings;
  private readonly credentials: YandexCredentials;

  constructor(settings: YandexSearchSettings, credentials: YandexCredentials) {
    this.settings = settings;
    this.credentials = credentials;
  }

  async search(query: string, maxResults: number): Promise<SearchResponse> {
    const requestedAt = new Date();
    const response = await this.sendSearchRequest(query, maxResults);
    const body = parseJsonOrKeepText(await response.text());
    if (!response.ok) {
      throw new ToolError(describeYandexError(response.status, body));
    }
    const validation = yandexResponseSchema.safeParse(body);
    if (!validation.success) {
      throw new ToolError(`Непонятный ответ Яндекса:\n${validation.error.message}`);
    }
    const xml = Buffer.from(validation.data.rawData, 'base64').toString('utf8');
    const results = parseYandexSearchXml(xml).slice(0, maxResults);
    return {
      results,
      details: {
        provider: this.name,
        searchType: this.settings.searchType,
        rawXmlBytes: Buffer.byteLength(xml, 'utf8'),
        resultCount: results.length,
        cost: calculateYandexSearchCost(this.settings.prices, requestedAt),
      },
    };
  }

  private async sendSearchRequest(query: string, maxResults: number): Promise<Response> {
    const baseWithSlash = this.settings.baseUrl.endsWith('/')
      ? this.settings.baseUrl
      : `${this.settings.baseUrl}/`;
    try {
      return await fetch(new URL(WEB_SEARCH_PATH, baseWithSlash), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': HARNESS_USER_AGENT,
          Authorization: `Api-Key ${this.credentials.apiKey}`,
        },
        body: JSON.stringify({
          query: { searchType: this.settings.searchType, queryText: query },
          folderId: this.credentials.folderId,
          responseFormat: 'FORMAT_XML',
          // Числа типа int64 в этом API передаются строками — так требует его JSON-формат.
          groupSpec: {
            groupMode: 'GROUP_MODE_DEEP',
            groupsOnPage: String(maxResults),
            // Один документ на сайт: иначе выдача забивается страницами одного сайта.
            docsInGroup: '1',
          },
          maxPassages: String(this.settings.maxPassages),
        }),
        signal: AbortSignal.timeout(this.settings.requestTimeoutMs),
      });
    } catch (error) {
      throw new ToolError(`Не удалось связаться с Яндексом: ${describeFetchFailure(error)}`);
    }
  }
}

function describeYandexError(status: number, body: unknown): string {
  const summary = `Яндекс ответил ошибкой HTTP ${status}`;
  const errorValidation = yandexErrorSchema.safeParse(body);
  if (errorValidation.success) {
    return `${summary}: ${errorValidation.data.message}`;
  }
  const bodyText = typeof body === 'string' ? body : JSON.stringify(body);
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

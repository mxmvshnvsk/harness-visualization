// Веб-тулы: загрузка страниц доступна всегда, поиск — только если есть провайдер.

import type { SearchProvider } from '../../search/searchProvider.js';
import type { WebFetchSettings } from '../../settings/settingsSchema.js';
import type { Tool } from '../toolTypes.js';
import { createFetchUrlTool } from './fetchUrlTool.js';
import { createWebSearchTool } from './webSearchTool.js';

export interface WebToolsOptions {
  webFetch: WebFetchSettings;
  // null — веб-поиск выключен (нет настроек или ключа).
  search: { provider: SearchProvider; defaultMaxResults: number } | null;
}

export function createWebTools(options: WebToolsOptions): Tool[] {
  const tools = [createFetchUrlTool(options.webFetch)];
  if (options.search !== null) {
    tools.push(createWebSearchTool(options.search.provider, options.search.defaultMaxResults));
  }
  return tools;
}

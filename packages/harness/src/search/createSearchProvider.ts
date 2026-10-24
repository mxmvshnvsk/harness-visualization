// Создаёт поискового провайдера по настройкам и ключам из .env.
// Если провайдер недоступен (нет настроек или ключа), возвращает понятную причину —
// харнесс напишет её в консоли и просто не зарегистрирует тул web_search.

import { readOptionalSecret } from '../settings/loadSettings.js';
import type {
  SearchProviderName,
  SearchSettings,
  TavilySettings,
  YandexSearchSettings,
} from '../settings/settingsSchema.js';
import type { SearchProvider } from './searchProvider.js';
import { TavilySearchProvider } from './TavilySearchProvider.js';
import { YandexSearchProvider } from './YandexSearchProvider.js';

export type SearchProviderSetup =
  { provider: SearchProvider; disabledReason: null } | { provider: null; disabledReason: string };

export async function createSearchProvider(
  searchSettings: SearchSettings | undefined,
  requestedProvider: SearchProviderName | null,
): Promise<SearchProviderSetup> {
  if (searchSettings === undefined) {
    return disabled('в harness.config.json нет раздела search');
  }
  const providerName = requestedProvider ?? searchSettings.provider;
  switch (providerName) {
    case 'tavily':
      return createTavilyProvider(searchSettings.tavily);
    case 'yandex':
      return createYandexProvider(searchSettings.yandex);
  }
}

async function createTavilyProvider(
  settings: TavilySettings | undefined,
): Promise<SearchProviderSetup> {
  if (settings === undefined) {
    return disabled('в harness.config.json нет настроек search.tavily');
  }
  const apiKey = await readOptionalSecret(settings.apiKeyVariable);
  if (apiKey === null) {
    return disabled(`нет ключа ${settings.apiKeyVariable} в .env`);
  }
  return { provider: new TavilySearchProvider(settings, apiKey), disabledReason: null };
}

async function createYandexProvider(
  settings: YandexSearchSettings | undefined,
): Promise<SearchProviderSetup> {
  if (settings === undefined) {
    return disabled('в harness.config.json нет настроек search.yandex');
  }
  const apiKey = await readOptionalSecret(settings.apiKeyVariable);
  const folderId = await readOptionalSecret(settings.folderIdVariable);
  if (apiKey === null || folderId === null) {
    return disabled(`нет ${settings.apiKeyVariable} или ${settings.folderIdVariable} в .env`);
  }
  return {
    provider: new YandexSearchProvider(settings, { apiKey, folderId }),
    disabledReason: null,
  };
}

function disabled(reason: string): SearchProviderSetup {
  return { provider: null, disabledReason: reason };
}

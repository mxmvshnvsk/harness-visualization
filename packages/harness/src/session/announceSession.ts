// Первые события сессии: с какой моделью, через какую сеть и в какой папке работает агент.

import type { EventStream } from '../events/EventStream.js';
import type { ReasoningEffort } from '../model/chatTypes.js';
import type { HarnessSettings, RetrievalMode } from '../settings/settingsSchema.js';
import type { PreparedWorkspace } from '../workspace/prepareWorkspace.js';
import { maskProxyUrl, readProxyUrl } from '../network/proxyFromEnvironment.js';

export interface SessionAnnouncement {
  settings: HarnessSettings;
  reasoningEffort: ReasoningEffort;
  // Папка песочницы относительно корня проекта.
  workspaceDirectory: string;
  preparedWorkspace: PreparedWorkspace;
  // null — веб-поиск выключен.
  searchProviderName: string | null;
  retrievalMode: RetrievalMode;
}

export function announceSession(events: EventStream, announcement: SessionAnnouncement): void {
  const { settings } = announcement;
  events.emit({
    type: 'session_started',
    providerName: settings.model.providerName,
    baseUrl: settings.model.baseUrl,
    model: settings.model.model,
    reasoningEffort: announcement.reasoningEffort,
    networkProxy: describeNetworkProxy(),
    searchProvider: announcement.searchProviderName,
    retrievalMode: announcement.retrievalMode,
  });
  events.emit({
    type: 'workspace_prepared',
    directory: announcement.workspaceDirectory,
    createdFromSeed: announcement.preparedWorkspace.createdFromSeed,
    wasReset: announcement.preparedWorkspace.wasReset,
  });
}

// Какой прокси получат запросы с маршрутом proxy; null — прокси в окружении не задан.
function describeNetworkProxy(): string | null {
  const proxyUrl = readProxyUrl();
  return proxyUrl === null ? null : maskProxyUrl(proxyUrl);
}

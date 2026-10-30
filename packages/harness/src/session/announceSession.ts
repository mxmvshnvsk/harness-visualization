// Первые события сессии: с какой моделью, через какую сеть и в какой папке работает агент.

import type { EventStream } from '../events/EventStream.js';
import type { ReasoningEffort } from '../model/chatTypes.js';
import type { ArenaRun, OrchestrationMode } from '../events/harnessEvents.js';
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
  // null — оркестрация: выбор поиска не действует, поле в событие не пишем.
  retrievalMode: RetrievalMode | null;
  // null — субагенты выключены.
  subagents: { agents: string[]; parallel: boolean } | null;
  orchestration: OrchestrationMode | null;
  demoProject: boolean;
  // Прогон Код-арены (этап 10); null — обычная сессия.
  arena: ArenaRun | null;
}

export function announceSession(events: EventStream, announcement: SessionAnnouncement): void {
  const { settings } = announcement;
  events.emit({
    type: 'session_started',
    providerName: settings.model.providerName,
    baseUrl: settings.model.baseUrl,
    model: settings.model.model,
    ...(settings.model.modelKey === undefined ? {} : { modelKey: settings.model.modelKey }),
    ...(settings.model.label === undefined ? {} : { modelLabel: settings.model.label }),
    ...(settings.model.dialect === undefined ? {} : { dialect: settings.model.dialect }),
    reasoningEffort: announcement.reasoningEffort,
    networkProxy: describeNetworkProxy(),
    searchProvider: announcement.searchProviderName,
    ...(announcement.retrievalMode === null ? {} : { retrievalMode: announcement.retrievalMode }),
    subagents: announcement.subagents,
    orchestration: announcement.orchestration,
    demoProject: announcement.demoProject,
    ...(announcement.arena === null ? {} : { arena: announcement.arena }),
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

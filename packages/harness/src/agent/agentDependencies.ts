// То, что нужно агенту для работы. Передаётся снаружи,
// чтобы агент не знал, откуда берутся провайдер, тулы, события, цены
// и как именно пользователь подтверждает действия (консоль или интерфейс).

import type { EventStream } from '../events/EventStream.js';
import type { ModelProvider } from '../model/modelProvider.js';
import type { ModelPrices, PermissionsSettings } from '../settings/settingsSchema.js';
import type { ToolRegistry } from '../tools/ToolRegistry.js';
import type { ToolContext } from '../tools/toolTypes.js';

export interface ConfirmationRequest {
  toolName: string;
  // Понятное человеку описание действия: «Удалить файл notes/a.md».
  actionDescription: string;
}

// Возвращает true, если пользователь разрешил действие.
export type ConfirmAction = (request: ConfirmationRequest) => Promise<boolean>;

export interface AgentDependencies {
  provider: ModelProvider;
  events: EventStream;
  prices: Record<string, ModelPrices>;
  tools: ToolRegistry;
  toolContext: ToolContext;
  confirmAction: ConfirmAction;
  // Правила, по которым харнесс решает: разрешить вызов тула, спросить пользователя или запретить.
  permissionPolicy: PermissionsSettings;
}

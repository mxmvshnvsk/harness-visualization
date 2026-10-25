// То, что нужно агенту для работы. Передаётся снаружи,
// чтобы агент не знал, откуда берутся провайдер, тулы, события, цены
// и как именно пользователь подтверждает действия (консоль или интерфейс).

import type { BudgetSettings } from '../context/promptBudget.js';
import type { EventStream } from '../events/EventStream.js';
import type { ModelProvider } from '../model/modelProvider.js';
import type { PermissionAnswerSource } from '../permissions/permissionTypes.js';
import type { ModelPrices, PermissionsSettings } from '../settings/settingsSchema.js';
import type { ToolRegistry } from '../tools/ToolRegistry.js';
import type { ToolContext } from '../tools/toolTypes.js';
import type { McpServerInstructions } from './systemPrompt.js';

export interface ConfirmationRequest {
  // По нему ответ из браузера находит свой вопрос.
  toolCallId: string;
  toolName: string;
  // Понятное человеку описание действия: «Удалить файл notes/a.md».
  actionDescription: string;
}

export interface PermissionAnswer {
  approved: boolean;
  answeredBy: PermissionAnswerSource;
}

export type ConfirmAction = (request: ConfirmationRequest) => Promise<PermissionAnswer>;

export interface AgentDependencies {
  provider: ModelProvider;
  events: EventStream;
  prices: Record<string, ModelPrices>;
  // Тулы, которые харнесс предлагает модели.
  tools: ToolRegistry;
  // Тулы, которые вызывает только сам харнесс; модель о них не знает (hiddenTools MCP-сервера).
  harnessOnlyTools: ToolRegistry;
  toolContext: ToolContext;
  confirmAction: ConfirmAction;
  // Правила, по которым харнесс решает: разрешить вызов тула, спросить пользователя или запретить.
  permissionPolicy: PermissionsSettings;
  // Инструкции подключённых MCP-серверов — попадут в системный промпт.
  mcpServerInstructions: McpServerInstructions[];
  // Сколько харнесс отводит prompt и как оценивает его размер (этап 6.2).
  budget: BudgetSettings;
}

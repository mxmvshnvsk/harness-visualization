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
import type { MemoryStore } from '../memory/MemoryStore.js';
import type { ProgressTracker } from '../progress/ProgressTracker.js';
import type { SkillLibrary } from '../skills/SkillLibrary.js';
import type { McpServerInstructions } from './systemPrompt.js';
import type { SessionRoleModels } from './roleModelProviders.js';

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

export interface SessionMemory {
  store: MemoryStore;
  // memo.md на начало сессии — он в system prompt; null — файла нет.
  memoAtStart: string | null;
}

export interface AgentDependencies {
  provider: ModelProvider;
  // Необязательно для старых клиентов и изолированных запусков цикла агента.
  roleModels?: SessionRoleModels;
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
  // Скиллы сессии: каталог в system prompt, загрузка тулом и командой «/имя» (этап 6b).
  skills: SkillLibrary;
  // Память между сессиями (этап 6b): тул memory и memo.md в system prompt.
  memory: SessionMemory;
  // План сессии из update_progress (этап 6b).
  progress: ProgressTracker;
  // Сколько харнесс отводит prompt и как оценивает его размер (этап 6.2).
  budget: BudgetSettings;
  // false — сессия без демо-проекта: короткий system prompt без «Кедр Софт».
  demoProject: boolean;
  // Прогон Код-арены (этап 10): свой system prompt — проект и задача.
  // task — задача «Кедр Софт» с приёмкой, free — свободный режим (этап 10.4).
  arena?: 'task' | 'free' | null;
  // Несколько delegate_task в одном шаге — одновременно (subagents.parallel, этап 6c).
  parallelDelegation: boolean;
  // Кто сжимает историю в сводку (этап 6.5): та же модель или указанная в context.compactionModel.
  compactionProvider: ModelProvider;
}

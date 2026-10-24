// То, что нужно агенту для работы. Передаётся снаружи,
// чтобы агент не знал, откуда берутся провайдер, тулы, события и цены.

import type { EventStream } from '../events/EventStream.js';
import type { ModelProvider } from '../model/modelProvider.js';
import type { ModelPrices } from '../settings/settingsSchema.js';
import type { ToolRegistry } from '../tools/ToolRegistry.js';
import type { ToolContext } from '../tools/toolTypes.js';

export interface AgentDependencies {
  provider: ModelProvider;
  events: EventStream;
  prices: Record<string, ModelPrices>;
  tools: ToolRegistry;
  toolContext: ToolContext;
}

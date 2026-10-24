// То, что нужно агенту для работы. Передаётся снаружи,
// чтобы агент не знал, откуда берутся провайдер, события и цены.

import type { EventStream } from '../events/EventStream.js';
import type { ModelProvider } from '../model/modelProvider.js';
import type { ModelPrices } from '../settings/settingsSchema.js';

export interface AgentDependencies {
  provider: ModelProvider;
  events: EventStream;
  prices: Record<string, ModelPrices>;
}

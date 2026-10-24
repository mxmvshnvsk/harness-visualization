// Копит токены и стоимость за сессию. Подписывается на поток событий,
// поэтому ничего не знает о том, кто и как отправляет запросы к модели и вызывает тулы.

import type { TokenUsage } from '../model/chatTypes.js';
import type { HarnessEvent } from '../events/harnessEvents.js';
import type { RequestCost, SessionCost, ToolCallCost, ToolCostTotal } from './costTypes.js';

export interface TokenomicsSummary {
  modelRequests: number;
  usage: TokenUsage;
  modelCost: SessionCost | null;
  toolCosts: ToolCostTotal[];
}

export class SessionTokenomics {
  private modelRequests = 0;
  private readonly usage: TokenUsage = {
    inputTokens: 0,
    inputCacheHitTokens: 0,
    inputCacheMissTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
  };
  private modelCostCurrency: string | null = null;
  private modelCostTotal = 0;
  // Если хотя бы для одного запроса цена неизвестна, стоимость модели тоже неизвестна.
  private hasUnknownModelCost = false;
  // Ключ — тул и валюта: у одного тула в разных сессиях может быть разная валюта.
  private readonly toolCosts = new Map<string, ToolCostTotal>();

  handleEvent(event: HarnessEvent): void {
    if (event.type === 'model_response') {
      this.recordModelRequest(event.reply.usage, event.cost);
    }
    if (event.type === 'tool_result' && event.cost !== null) {
      this.recordToolCost(event.toolName, event.cost);
    }
  }

  summary(): TokenomicsSummary {
    return {
      modelRequests: this.modelRequests,
      usage: { ...this.usage },
      modelCost: this.buildModelCost(),
      toolCosts: [...this.toolCosts.values()].map((total) => ({ ...total })),
    };
  }

  private recordModelRequest(usage: TokenUsage, cost: RequestCost | null): void {
    this.modelRequests += 1;
    this.usage.inputTokens += usage.inputTokens;
    this.usage.inputCacheHitTokens += usage.inputCacheHitTokens;
    this.usage.inputCacheMissTokens += usage.inputCacheMissTokens;
    this.usage.outputTokens += usage.outputTokens;
    this.usage.reasoningTokens += usage.reasoningTokens;
    if (cost === null) {
      this.hasUnknownModelCost = true;
      return;
    }
    this.modelCostCurrency = cost.currency;
    this.modelCostTotal += cost.total;
  }

  private recordToolCost(toolName: string, cost: ToolCallCost): void {
    const key = `${toolName} ${cost.currency}`;
    const total = this.toolCosts.get(key);
    if (total === undefined) {
      this.toolCosts.set(key, { toolName, currency: cost.currency, total: cost.amount, calls: 1 });
      return;
    }
    total.total += cost.amount;
    total.calls += 1;
  }

  private buildModelCost(): SessionCost | null {
    if (this.hasUnknownModelCost || this.modelCostCurrency === null) {
      return null;
    }
    return { currency: this.modelCostCurrency, total: this.modelCostTotal };
  }
}

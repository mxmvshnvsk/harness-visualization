// Копит токены и стоимость за сессию. Подписывается на поток событий,
// поэтому ничего не знает о том, кто и как отправляет запросы к модели.

import type { TokenUsage } from '../model/chatTypes.js';
import type { HarnessEvent } from '../events/harnessEvents.js';
import type { RequestCost, SessionCost } from './costTypes.js';

export interface TokenomicsSummary {
  modelRequests: number;
  usage: TokenUsage;
  cost: SessionCost | null;
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
  private costCurrency: string | null = null;
  private costTotal = 0;
  // Если хотя бы для одного запроса цена неизвестна, общая стоимость тоже неизвестна.
  private hasUnknownCost = false;

  handleEvent(event: HarnessEvent): void {
    if (event.type === 'model_response') {
      this.recordRequest(event.reply.usage, event.cost);
    }
  }

  summary(): TokenomicsSummary {
    return {
      modelRequests: this.modelRequests,
      usage: { ...this.usage },
      cost: this.buildSessionCost(),
    };
  }

  private recordRequest(usage: TokenUsage, cost: RequestCost | null): void {
    this.modelRequests += 1;
    this.usage.inputTokens += usage.inputTokens;
    this.usage.inputCacheHitTokens += usage.inputCacheHitTokens;
    this.usage.inputCacheMissTokens += usage.inputCacheMissTokens;
    this.usage.outputTokens += usage.outputTokens;
    this.usage.reasoningTokens += usage.reasoningTokens;
    if (cost === null) {
      this.hasUnknownCost = true;
      return;
    }
    this.costCurrency = cost.currency;
    this.costTotal += cost.total;
  }

  private buildSessionCost(): SessionCost | null {
    if (this.hasUnknownCost || this.costCurrency === null) {
      return null;
    }
    return { currency: this.costCurrency, total: this.costTotal };
  }
}

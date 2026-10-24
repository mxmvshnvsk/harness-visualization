// Решает по адресу хоста, каким маршрутом идти: через прокси или напрямую.
// Правила проверяются по порядку, первое подходящее решает; если ни одно не подошло —
// маршрут по умолчанию. Та же функция и направляет запрос, и объясняет решение в трейсе.

import { matchesHostPattern } from '../permissions/matchPatterns.js';
import type { NetworkRoute, NetworkSettings } from '../settings/settingsSchema.js';

export interface NetworkRouteDecision {
  route: NetworkRoute;
  // Описание сработавшего правила; null — сработал маршрут по умолчанию.
  rule: string | null;
}

export function resolveNetworkRoute(host: string, settings: NetworkSettings): NetworkRouteDecision {
  for (const rule of settings.rules) {
    if (matchesHostPattern(host, rule.hostPattern)) {
      return { route: rule.route, rule: rule.description };
    }
  }
  return { route: settings.defaultRoute, rule: null };
}

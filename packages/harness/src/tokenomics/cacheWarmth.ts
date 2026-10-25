// Прогрет ли кэш промпта к первому запросу сессии. Внутри сессии кэш растёт сам:
// каждый шаг заново отправляет весь контекст, и его начало уже в кэше. А первый запрос
// попадает в кэш, только если такое же начало недавно отправлял кто-то ещё —
// предыдущая сессия или другая программа с тем же ключом. Провайдер не говорит, кто это был.
//
// Небольшое попадание бывает и у «холодного» запроса: общее начало у многих запросов
// (у DeepSeek в трейсе 2026-10-25 — 128 токенов из 1 967). Поэтому порог — доля входа.

import type { TokenUsage } from '../model/chatTypes.js';

export const WARM_SHARE_THRESHOLD = 0.1;

export type CacheWarmth = 'cold' | 'warm';

export function classifyCacheWarmth(usage: TokenUsage): CacheWarmth {
  if (usage.inputTokens === 0) {
    return 'cold';
  }
  return usage.inputCacheHitTokens / usage.inputTokens >= WARM_SHARE_THRESHOLD ? 'warm' : 'cold';
}

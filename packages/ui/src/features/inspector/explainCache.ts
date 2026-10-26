// Объяснение кэша prompt человеку: сколько пришло из кэша и чем это можно объяснить.
// Провайдер сообщает только число токенов из кэша, но не кто его прогрел, — поэтому
// объяснение опирается на сравнение с предыдущим шагом и честно говорит, где это догадка.

import { WARM_SHARE_THRESHOLD } from '@harness-visualization/harness/tokenomics';
import type { CacheView } from '../../projections/sessionView';
import { formatRu } from '../../text/formatNumber';

export interface CacheExplanation {
  // Коротко, для бейджа.
  label: string;
  text: string;
}

export function explainCache(cache: CacheView, inputTokens: number): CacheExplanation {
  const hit = formatTokens(cache.hitTokens);
  const total = formatTokens(inputTokens);
  if (cache.warmth === 'cold') {
    return {
      label: 'prompt cache холодный',
      text:
        `Из кэша пришло ${hit} токенов из ${total} — меньше ${formatShare(WARM_SHARE_THRESHOLD)}, кэш не прогрет. ` +
        'Небольшое попадание бывает у любого запроса: начало prompt у многих запросов общее.',
    };
  }
  const label = `prompt cache прогрет · ${hit}`;
  const share = `Из кэша пришло ${hit} токенов из ${total} (${formatShare(cache.share)}) — они дешевле; остальные ${formatTokens(cache.missTokens)} посчитаны заново.`;
  if (cache.previousStepInputTokens === null) {
    return {
      label,
      text: `${share} Это первый запрос, сравнить не с чем: такое же начало prompt недавно отправлял кто-то ещё — прошлая сессия или другая программа с тем же ключом. Провайдер не говорит, кто.`,
    };
  }
  const previous = formatTokens(cache.previousStepInputTokens);
  if (cache.exceedsPreviousPrompt === true) {
    return {
      label,
      text: `${share} Это больше всего prompt предыдущего шага (${previous}), значит, кэш прогрел не только он: такое же начало prompt отправляли и раньше — например, в прошлых сессиях с тем же вопросом.`,
    };
  }
  return {
    label,
    text: `${share} Это укладывается в prompt предыдущего шага (${previous}): каждый шаг заново отправляет весь контекст, и его начало уже в кэше.`,
  };
}

function formatTokens(value: number): string {
  return formatRu(value);
}

function formatShare(share: number): string {
  return `${String(Math.round(share * 100))} %`;
}

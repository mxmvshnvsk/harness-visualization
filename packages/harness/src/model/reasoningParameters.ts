// Переводит наш нейтральный уровень рассуждений в параметры конкретного API.
// У каждого провайдера свои названия и уровни, поэтому перевод живёт здесь, а не в харнессе.

import type { ReasoningStyle } from '../settings/settingsSchema.js';
import type { ReasoningEffort } from './chatTypes.js';

export function buildReasoningParameters(
  style: ReasoningStyle,
  effort: ReasoningEffort,
): Record<string, unknown> {
  switch (style) {
    case 'deepseek':
      return buildDeepSeekParameters(effort);
    case 'openrouter':
      return { reasoning: effort === 'off' ? { enabled: false } : { effort } };
    case 'openai':
      return { reasoning_effort: effort === 'off' ? 'none' : effort };
    case 'none':
      // Провайдер не умеет регулировать рассуждения — ничего не добавляем.
      return {};
  }
}

// DeepSeek: thinking включает или выключает рассуждения,
// reasoning_effort (low, high, max) задаёт их глубину.
function buildDeepSeekParameters(effort: ReasoningEffort): Record<string, unknown> {
  if (effort === 'off') {
    return { thinking: { type: 'disabled' } };
  }
  return { thinking: { type: 'enabled' }, reasoning_effort: effort };
}

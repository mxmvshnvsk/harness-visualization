import { describe, expect, it } from 'vitest';
import type { CacheView } from '../../projections/sessionView';
import { explainCache } from './explainCache';

function cache(overrides: Partial<CacheView>): CacheView {
  return {
    hitTokens: 2048,
    missTokens: 1211,
    share: 2048 / 3259,
    warmth: 'warm',
    exceedsPreviousPrompt: null,
    previousStepInputTokens: null,
    ...overrides,
  };
}

// Числа форматируются по-русски: разряды разделены неразрывным пробелом (\u00a0).
describe('explainCache', () => {
  it('больше prompt предыдущего шага — кэш прогрет не только им', () => {
    const { label, text } = explainCache(
      cache({ exceedsPreviousPrompt: true, previousStepInputTokens: 1963 }),
      3259,
    );

    expect(label).toBe('prompt cache прогрет · 2\u00a0048');
    expect(text).toContain('63 %');
    expect(text).toContain('больше всего prompt предыдущего шага (1\u00a0963)');
  });

  it('в пределах предыдущего шага — его начало уже в кэше', () => {
    const { text } = explainCache(
      cache({ exceedsPreviousPrompt: false, previousStepInputTokens: 2600 }),
      3259,
    );

    expect(text).toContain('укладывается в prompt предыдущего шага (2\u00a0600)');
  });

  it('первый запрос — сравнить не с чем, и это сказано прямо', () => {
    expect(explainCache(cache({}), 3259).text).toContain('Провайдер не говорит, кто');
  });

  it('холодный — с порогом харнесса', () => {
    const { label, text } = explainCache(
      cache({ hitTokens: 128, missTokens: 1839, share: 128 / 1967, warmth: 'cold' }),
      1967,
    );

    expect(label).toBe('prompt cache холодный');
    expect(text).toContain('меньше 10 %');
  });
});

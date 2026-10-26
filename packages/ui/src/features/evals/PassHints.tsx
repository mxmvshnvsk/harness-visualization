// Подписи pass@k, pass^k и «попыток прошло» с подсказкой: что значит число.
// По вопросу автора, 26.10.2026.

import type { ReactElement } from 'react';
import { Hint } from '../../components/Hint';

export function PassAtHint({ trials }: { trials: number }): ReactElement {
  const count = String(trials);
  return (
    <Hint
      text={`pass@${count} — задача решена хоть раз из ${count} попыток: умеет ли агент в принципе. Процент — доля таких задач. Растёт с числом попыток: дай больше — где-нибудь да угадает.`}
    >
      pass@{count}
    </Hint>
  );
}

export function PassHatHint({ trials }: { trials: number }): ReactElement {
  const count = String(trials);
  return (
    <Hint
      text={`pass^${count} — задача решена во всех ${count} попытках: можно ли на агента положиться. Процент — доля таких задач. Для агента, который отвечает людям, важнее pass@${count}: пользователь видит одну попытку, а не лучшую из ${count}.`}
    >
      pass^{count}
    </Hint>
  );
}

export function PassRateHint(): ReactElement {
  return (
    <Hint text="Доля удачных попыток среди всех: ✓ из всех клеток. «?» — провалов нет, но судья не вынес вердикта — в удачные не засчитывается.">
      попыток прошло
    </Hint>
  );
}

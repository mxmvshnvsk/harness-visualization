import { ModelActor } from '../models/ModelActor';
// Переход из «Скиллы и память» к вызову тула, который загрузил скилл, правил память или записал
// план: в инспекторе раскрыт этот вызов — аргументы от модели, решение политики, результат.
// Нет вызова (скилл «всегда в prompt», команда /имя) — ссылки нет.

import type { ReactElement } from 'react';
import type { Moment } from '../../projections/projectSkillsMemory';
import { ChainLinks } from '../ChainLinks';

export function CallLink({ moment }: { moment: Moment }): ReactElement | null {
  if (moment.toolCallId === null) {
    return <ModelActor eventIndex={moment.index} />;
  }
  return <ChainLinks link={{ toolCallId: moment.toolCallId, query: '' }} inspector />;
}

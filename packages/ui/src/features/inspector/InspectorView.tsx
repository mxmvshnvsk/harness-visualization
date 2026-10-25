// Инспектор: этапы сессии на всю ширину — «Подготовка», шаги агента, ответ. Строки этапа
// проявляются по ходу повтора, текущий этап выделен, и при воспроизведении страница плавно
// доезжает до него. Прокрутили сами — подскролл ждёт кнопки «к текущему шагу». Клик по строке
// перематывает к ней. «Подробнее» раскрывает запрос к модели, тул или retrieval прямо в карточке.

import type { HarnessEvent } from '@harness-visualization/harness';
import { useMemo, type ReactElement } from 'react';
import { activeStage, projectStages } from '../../projections/projectStages';
import type { SessionView } from '../../projections/sessionView';
import { timeAt, type Schedule } from '../../timeline/schedule';
import type { TimelineClock } from '../../timeline/TimelineClock';
import { StageCard } from './StageCard';
import styles from './Stages.module.css';
import { useFollowActive } from './useFollowActive';

interface InspectorViewProps {
  view: SessionView;
  // Все события записи и сколько из них уже показано.
  events: readonly HarnessEvent[];
  shown: number;
  clock: TimelineClock;
  schedule: Schedule;
}

export function InspectorView({
  view,
  events,
  shown,
  clock,
  schedule,
}: InspectorViewProps): ReactElement {
  const stages = useMemo(() => projectStages(events), [events]);
  const active = activeStage(stages, shown);
  const follow = useFollowActive(active?.id ?? null, clock);
  if (stages.length === 0) {
    return <div className={styles.empty}>Событий пока нет.</div>;
  }
  return (
    <div className={styles.stages}>
      {stages.map((stage) => (
        <StageCard
          key={stage.id}
          stage={stage}
          view={view}
          shown={shown}
          active={stage.id === active?.id}
          cardRef={follow.register(stage.id)}
          onSeek={(at) => {
            clock.seek(timeAt(schedule, at));
          }}
        />
      ))}
      {follow.paused && (
        <button type="button" className={styles.followChip} onClick={follow.resume}>
          ↓ к текущему шагу
        </button>
      )}
    </div>
  );
}

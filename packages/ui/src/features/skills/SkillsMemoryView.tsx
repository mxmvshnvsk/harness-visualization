// Экран «Скиллы и память» (этап 6b): что из скиллов модель видела и что загрузила, что было
// в памяти на старте и как она менялась, как модель вела план. Повтор учитывается: будущее
// бледное, клик по событию перематывает к нему.

import type { HarnessEvent } from '@harness-visualization/harness';
import { useMemo, type ReactElement } from 'react';
import { Term } from '../../help/HelpLinks';
import { projectSkillsMemory, type Moment } from '../../projections/projectSkillsMemory';
import { timeAt, type Schedule } from '../../timeline/schedule';
import type { TimelineClock } from '../../timeline/TimelineClock';
import { MemoryCard } from './MemoryCard';
import { PlanCard } from './PlanCard';
import { SkillsCard } from './SkillsCard';
import styles from './SkillsMemory.module.css';

interface SkillsMemoryViewProps {
  events: readonly HarnessEvent[];
  shown: number;
  clock: TimelineClock;
  schedule: Schedule;
}

export function SkillsMemoryView(props: SkillsMemoryViewProps): ReactElement {
  const { events, shown, clock, schedule } = props;
  const view = useMemo(() => projectSkillsMemory(events), [events]);
  const seek = (moment: Moment): void => {
    clock.seek(timeAt(schedule, moment.at));
  };
  if (view.catalog === null && view.memoPath === null && view.plans.length === 0) {
    return (
      <div className={styles.empty}>
        В этой записи нет скиллов, памяти и плана — они появились в харнессе на этапе 6b.
      </div>
    );
  }
  return (
    <div className={styles.screen}>
      <p className={styles.intro}>
        Что агент знает сверх вопроса: <Term topic="skills-memory">скиллы</Term> — инструкции для
        задач, память — заметки между сессиями, план — шаги текущей задачи.
      </p>
      <SkillsCard view={view} shown={shown} ended={shown >= events.length} onSeek={seek} />
      <MemoryCard view={view} shown={shown} onSeek={seek} />
      <PlanCard view={view} shown={shown} onSeek={seek} />
    </div>
  );
}

// Экран «Скиллы и память» (этап 6b): что из скиллов модель видела и что загрузила, что было
// в памяти на старте и как она менялась, как модель вела план. Повтор учитывается: будущее
// бледное, клик по событию перематывает к нему.

import type { HarnessEvent } from '@harness-visualization/harness';
import { useEffect, useMemo, useRef, type ReactElement } from 'react';
import type { SearchLink } from '../../app/viewLinks';
import { Term } from '../../help/HelpLinks';
import { projectSkillsMemory, type Moment } from '../../projections/projectSkillsMemory';
import { timeAt, type Schedule } from '../../timeline/schedule';
import type { TimelineClock } from '../../timeline/TimelineClock';
import { MemoryCard } from './MemoryCard';
import { PlanCard } from './PlanCard';
import { SkillsCard } from './SkillsCard';
import styles from './SkillsMemory.module.css';

interface SkillsMemoryViewProps {
  // Пришли из инспектора: что подсветить — то, что сделал этот вызов тула.
  focus?: SearchLink | null;
  events: readonly HarnessEvent[];
  shown: number;
  clock: TimelineClock;
  schedule: Schedule;
}

export function SkillsMemoryView(props: SkillsMemoryViewProps): ReactElement {
  const { events, shown, clock, schedule } = props;
  const view = useMemo(() => projectSkillsMemory(events), [events]);
  const focused = props.focus?.toolCallId ?? null;
  const screen = useFocusedIntoView(focused);
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
    <div ref={screen} className={styles.screen}>
      <p className={styles.intro}>
        Что агент знает сверх вопроса: <Term topic="skills-memory">скиллы</Term> — инструкции для
        задач, память — заметки между сессиями, план — шаги текущей задачи.
      </p>
      <SkillsCard
        view={view}
        shown={shown}
        ended={shown >= events.length}
        focused={focused}
        onSeek={seek}
      />
      <MemoryCard view={view} shown={shown} focused={focused} onSeek={seek} />
      <PlanCard view={view} shown={shown} focused={focused} onSeek={seek} />
    </div>
  );
}

// Пришли по ссылке — подсвеченная строка встаёт перед глазами.
function useFocusedIntoView(focused: string | null) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focused !== null) {
      ref.current?.querySelector('[data-focused="true"]')?.scrollIntoView({ block: 'center' });
    }
  }, [focused]);
  return ref;
}

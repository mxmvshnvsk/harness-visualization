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
import type { SearchLink } from '../../app/viewLinks';
import type { Stage } from '../../projections/projectStages';
import type { Focus } from './focus';
import { McpPairsContext, useMcpPairs } from './mcpPairs';
import { StageCard } from './StageCard';
import { SubagentStepsContext, subagentOfCall, useSubagentStepsOf } from './subagentSteps';
import styles from './Stages.module.css';
import { useFollowActive } from './useFollowActive';

interface InspectorViewProps {
  view: SessionView;
  // Все события записи и сколько из них уже показано.
  events: readonly HarnessEvent[];
  shown: number;
  clock: TimelineClock;
  schedule: Schedule;
  // Пришли из журнала MCP или «RAG»: какой вызов раскрыть.
  focus?: SearchLink | null;
}

export function InspectorView({
  view,
  events,
  shown,
  clock,
  schedule,
  focus,
}: InspectorViewProps): ReactElement {
  const stages = useMemo(() => projectStages(events), [events]);
  const active = activeStage(stages, shown);
  const follow = useFollowActive(active?.id ?? null, clock);
  const mcpPairs = useMcpPairs(events, shown);
  const target = focusTarget(events, focus ?? null);
  const steps = useSubagentStepsOf(events);
  const subagents = useMemo(
    () => ({ steps, focused: subagentOfCall(steps, focus?.toolCallId ?? null) }),
    [steps, focus?.toolCallId],
  );
  if (stages.length === 0) {
    return <div className={styles.empty}>Событий пока нет.</div>;
  }
  return (
    <McpPairsContext.Provider value={mcpPairs}>
      <SubagentStepsContext.Provider value={subagents}>
        <div className={styles.stages}>
          {stages.map((stage) => (
            <StageCard
              key={stage.id}
              stage={stage}
              view={view}
              shown={shown}
              active={stage.id === active?.id}
              focus={subagents.focused === null ? inStage(stage, target) : null}
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
      </SubagentStepsContext.Provider>
    </McpPairsContext.Provider>
  );
}

interface FocusTarget {
  index: number;
  focus: Focus;
}

// Куда прийти: вызов тула — к его tool_call, поиск харнесса — к context_retrieved.
function focusTarget(events: readonly HarnessEvent[], link: SearchLink | null): FocusTarget | null {
  if (link === null) {
    return null;
  }
  const { toolCallId } = link;
  const index =
    toolCallId === null
      ? events.findIndex((event) => event.type === 'context_retrieved')
      : events.findIndex((event) => event.type === 'tool_call' && event.toolCallId === toolCallId);
  if (index < 0) {
    return null;
  }
  return {
    index,
    focus: toolCallId === null ? { kind: 'retrieval' } : { kind: 'tool', toolCallId },
  };
}

function inStage(stage: Stage, target: FocusTarget | null): Focus | null {
  return target !== null && stage.firstIndex <= target.index && target.index <= stage.lastIndex
    ? target.focus
    : null;
}

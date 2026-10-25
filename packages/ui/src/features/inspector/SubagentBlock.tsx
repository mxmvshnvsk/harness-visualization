// Шаги субагента под строкой поручения (этап 6c): те же карточки этапов, что у главного агента,
// с полосой цвета субагента. Пока субагент работает на месте повтора — раскрыто само.

import { useState, type ReactElement } from 'react';
import { activeStage } from '../../projections/projectStages';
import { runAt } from '../../projections/projectSubagents';
import type { SessionView } from '../../projections/sessionView';
import { StageCard } from './StageCard';
import { useSubagentSteps } from './subagentSteps';
import styles from './Stages.module.css';

interface SubagentBlockProps {
  subagentId: string;
  view: SessionView;
  shown: number;
  onSeek: (at: number) => void;
}

export function SubagentBlock(props: SubagentBlockProps): ReactElement | null {
  const { subagentId, view, shown, onSeek } = props;
  const steps = useSubagentSteps(subagentId);
  const state = steps === null ? 'future' : runAt(steps.run, shown);
  const [chosen, setChosen] = useState<boolean | null>(null);
  if (steps === null || state === 'future') {
    return null;
  }
  const open = chosen ?? state === 'running';
  const active = state === 'running' ? activeStage(steps.stages, shown) : null;
  const stepCount = steps.stages.filter((stage) => stage.kind === 'agent').length;
  return (
    <div className={styles.subagent} data-color={steps.run.color}>
      <button
        type="button"
        className={styles.subagentToggle}
        aria-expanded={open}
        onClick={() => {
          setChosen(!open);
        }}
      >
        {open ? '▾' : '▸'} шаги субагента {subagentId} · {stepCount} · своя история, свои тулы
      </button>
      {open && (
        <div className={styles.subagentStages}>
          {steps.stages.map((stage) => (
            <StageCard
              key={stage.id}
              stage={stage}
              view={view}
              shown={shown}
              active={stage.id === active?.id}
              nested
              cardRef={noRef}
              onSeek={onSeek}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function noRef(): void {
  // Вложенные карточки к текущему шагу не подкручиваются: за повтором следит карточка главного.
}

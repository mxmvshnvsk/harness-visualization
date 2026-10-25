// Свёрнутый диалог — узкая полоса у правого края на всю высоту, как боковые панели в IDE.
// Она занимает место в раскладке, а не висит поверх, поэтому ничего не перекрывает.
// На полосе: стрелка, слово «Диалог», точка, пока агент работает или ждёт вопроса,
// и сколько вопросов уже было. Нажать можно в любое место полосы.

import type { HarnessEvent } from '@harness-visualization/harness';
import { useMemo, type ReactElement } from 'react';
import { projectDialog } from '../../projections/projectDialog';
import styles from './Dialog.module.css';
import { modeOf, STATE_LABELS } from './dialogMode';

interface DialogRailProps {
  events: readonly HarnessEvent[];
  shown: number;
  sessionId: string | null;
  live: boolean;
  // Колонка открыта — полоса прячется под ней.
  hidden: boolean;
  onExpand: () => void;
}

export function DialogRail(props: DialogRailProps): ReactElement {
  const { events, shown, sessionId, live, hidden, onExpand } = props;
  const turns = useMemo(() => projectDialog(events), [events]);
  const asked = turns.filter((turn) => turn.askedIndex < shown).length;
  const mode = modeOf(sessionId, live, events);
  const active = mode === 'working' || mode === 'awaiting';
  const label = `Развернуть диалог · ${STATE_LABELS[mode]}`;
  return (
    <button
      type="button"
      className={styles.rail}
      data-hidden={hidden}
      inert={hidden}
      onClick={onExpand}
      aria-label={label}
      title={label}
    >
      <span className={styles.railArrow} aria-hidden="true">
        ←
      </span>
      <span className={styles.railWord}>Диалог</span>
      {active && <span className={styles.railDot} />}
      <span className={styles.railCount}>{questionsText(asked)}</span>
    </button>
  );
}

function questionsText(count: number): string {
  if (count === 0) {
    return 'вопросов нет';
  }
  return `вопросов: ${String(count)}`;
}

// Ход поиска по порядку: поиски харнесса до модели, поиски и чтения модели по шагам.

import type { ReactElement } from 'react';
import type { RetrievalAction } from '../../../projections/projectRetrieval';
import { AgentChip } from '../../agents/AgentChip';
import { actionLabel, placeOf } from './retrievalLabels';
import styles from './Retrieval.module.css';

interface SearchTimelineProps {
  actions: readonly RetrievalAction[];
  cited: ReadonlySet<string>;
  turns: number;
  selected: number | null;
  onSelect: (action: RetrievalAction) => void;
}

export function SearchTimeline(props: SearchTimelineProps): ReactElement {
  const { actions, cited, turns, selected, onSelect } = props;
  return (
    <ol className={styles.timeline}>
      {actions.map((action, position) => {
        const phase = placeOf(action, turns);
        const previous = actions[position - 1];
        const label = actionLabel(action);
        return (
          <li key={action.index}>
            {(previous === undefined || placeOf(previous, turns) !== phase) && (
              <span className={styles.phase}>{phase}</span>
            )}
            <button
              type="button"
              aria-pressed={action.index === selected}
              onClick={() => {
                onSelect(action);
              }}
            >
              <span className={styles.letter}>{label.letter}</span>
              <span className={styles.who}>
                <AgentChip agentId={action.agentId} /> {label.name} ·{' '}
                {action.kind === 'read'
                  ? `${String(action.chars)} симв.`
                  : `${String(action.documents.length)} док.`}
                {action.failed && ' · ошибка'}
              </span>
              <span className={styles.what}>
                {action.kind === 'read' ? action.documentId : `«${action.query}»`}
              </span>
            </button>
          </li>
        );
      })}
      {cited.size > 0 && (
        <li className={styles.answerItem}>
          Ответ называет: <span className={styles.mono}>{[...cited].join(', ')}</span>
        </li>
      )}
    </ol>
  );
}
